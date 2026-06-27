import type { NodeId } from "@/common/types";
import type { NodeChangeListener, ListenerHandle } from "../listener";
import type { Node } from "../../models/structures";
import type { Model } from "../../models";
import { postMessageToUI } from "../../figma";
import { elevateToCubic, bezierPathData } from "../../utils/bezier";

const START_SIZE   = 16;
const END_SIZE     = 16;
const BEZIER_SIZE  = 10;
const SNAP_RADIUS  = 24;

const START_FILL:    RGB = { r: 1,    g: 0.4,  b: 0   };
const END_FILL:      RGB = { r: 0,    g: 0.7,  b: 0.3 };
const BEZIER_FILL:   RGB = { r: 0.08, g: 0.6,  b: 1   };
const WHITE:         RGB = { r: 1,    g: 1,    b: 1   };
const PREVIEW_STROKE:RGB = { r: 0.6,  g: 0.75, b: 1   };

interface EndpointState {
  handleId: string;
  pos:  Vector;
  snap: Node | null;
}

export interface RoadPlacingResult {
  startPos:  Vector;
  startNode: Node | null;
  endPos:    Vector;
  endNode:   Node | null;
  bezierPos: Vector;
}

export class RoadPlacingState {
  private startState:     EndpointState | null = null;
  private endState:       EndpointState | null = null;
  private bezierHandleId: string | null = null;
  private bezierPos:      Vector = { x: 0, y: 0 };
  private previewId:      string | null = null;
  private listenerHandles: ListenerHandle[] = [];

  get isActive(): boolean { return this.startState !== null; }

  async begin(model: Model, listener: NodeChangeListener): Promise<void> {
    await this.cleanup();

    const center  = figma.viewport.center;
    const startPos  = { x: center.x - 80, y: center.y };
    const endPos    = { x: center.x + 80, y: center.y };
    const bezierPos = { x: center.x, y: center.y };

    const startHandle  = this.makeHandle(startPos,  START_SIZE,  START_FILL,  '_road-placing-start');
    const endHandle    = this.makeHandle(endPos,    END_SIZE,    END_FILL,    '_road-placing-end');
    const bezierHandle = this.makeHandle(bezierPos, BEZIER_SIZE, BEZIER_FILL, '_road-placing-bezier');
    const preview      = this.makePreview(startPos, bezierPos, endPos);

    figma.currentPage.appendChild(startHandle);
    figma.currentPage.appendChild(endHandle);
    figma.currentPage.appendChild(bezierHandle);
    figma.currentPage.appendChild(preview);

    this.startState     = { handleId: startHandle.id,  pos: startPos,  snap: null };
    this.endState       = { handleId: endHandle.id,    pos: endPos,    snap: null };
    this.bezierHandleId = bezierHandle.id;
    this.bezierPos      = bezierPos;
    this.previewId      = preview.id;

    const startId = startHandle.id;
    const endId   = endHandle.id;
    const bezId   = bezierHandle.id;

    this.listenerHandles = [
      listener.register(startId, change => this.onEndpointMoved(change, startId, 'start', START_SIZE, model)),
      listener.register(endId,   change => this.onEndpointMoved(change, endId,   'end',   END_SIZE,   model)),
      listener.register(bezId,   change => this.onBezierMoved(change, bezId)),
    ];

    this.postSnapUpdate();
    figma.currentPage.selection = [startHandle];
  }

  private async onEndpointMoved(
    change: DocumentChangeEvent['documentChanges'][number],
    handleId: string,
    which: 'start' | 'end',
    size: number,
    model: Model,
  ): Promise<void> {
    if (change.type !== 'PROPERTY_CHANGE') return;
    if (!change.properties.includes('x') && !change.properties.includes('y')) return;

    const state = which === 'start' ? this.startState : this.endState;
    if (!state) return;

    const figNode = await figma.getNodeByIdAsync(handleId);
    if (!figNode || figNode.removed) return;
    const h = figNode as EllipseNode;
    const center = { x: h.x + size / 2, y: h.y + size / 2 };

    state.pos  = center;
    state.snap = this.findNearestNode(center, model);

    await this.updatePreview();
    this.postSnapUpdate();
  }

  private async onBezierMoved(
    change: DocumentChangeEvent['documentChanges'][number],
    handleId: string,
  ): Promise<void> {
    if (change.type !== 'PROPERTY_CHANGE') return;
    if (!change.properties.includes('x') && !change.properties.includes('y')) return;

    const figNode = await figma.getNodeByIdAsync(handleId);
    if (!figNode || figNode.removed) return;
    const h = figNode as EllipseNode;
    this.bezierPos = { x: h.x + BEZIER_SIZE / 2, y: h.y + BEZIER_SIZE / 2 };

    await this.updatePreview();
  }

  private findNearestNode(pos: Vector, model: Model): Node | null {
    let nearest: Node | null = null;
    let nearestDist = SNAP_RADIUS;
    for (const node of model.state.getNodes()) {
      if (node.roadConnections.length === 0) continue;
      const c = this.nodeCenter(node);
      const dist = Math.hypot(c.x - pos.x, c.y - pos.y);
      if (dist < nearestDist) { nearestDist = dist; nearest = node; }
    }
    return nearest;
  }

  nodeCenter(node: Node): Vector {
    let sumX = 0, sumY = 0, count = 0;
    for (const { road, endpointIndex } of node.roadConnections) {
      sumX += road.endpoints[endpointIndex].endpointPos.x;
      sumY += road.endpoints[endpointIndex].endpointPos.y;
      count++;
    }
    return count > 0 ? { x: sumX / count, y: sumY / count } : { x: 0, y: 0 };
  }

  private effectivePos(state: EndpointState): Vector {
    return state.snap ? this.nodeCenter(state.snap) : state.pos;
  }

  private async updatePreview(): Promise<void> {
    if (!this.previewId || !this.startState || !this.endState) return;
    const node = await figma.getNodeByIdAsync(this.previewId);
    if (!node || node.removed) return;
    const v = node as VectorNode;

    const p0    = this.effectivePos(this.startState);
    const p2    = this.effectivePos(this.endState);
    const cubic = elevateToCubic({ p0, p1: this.bezierPos, p2 });

    const tx = v.absoluteTransform[0][2];
    const ty = v.absoluteTransform[1][2];
    const local = (pt: Vector): Vector => ({ x: pt.x - tx, y: pt.y - ty });

    v.vectorPaths = [{
      windingRule: 'NONZERO',
      data: bezierPathData({ p0: local(cubic.p0), p1: local(cubic.p1), p2: local(cubic.p2), p3: local(cubic.p3) }),
    }];
  }

  private postSnapUpdate(): void {
    const s = this.startState?.snap;
    const e = this.endState?.snap;
    postMessageToUI({
      type: 'road-creation-snap-update',
      startSnap: s ? { nodeId: s.id as NodeId, name: s.name } : null,
      endSnap:   e ? { nodeId: e.id as NodeId, name: e.name } : null,
    });
  }

  getResult(): RoadPlacingResult | null {
    if (!this.startState || !this.endState) return null;
    return {
      startPos:  this.effectivePos(this.startState),
      startNode: this.startState.snap,
      endPos:    this.effectivePos(this.endState),
      endNode:   this.endState.snap,
      bezierPos: this.bezierPos,
    };
  }

  async cleanup(): Promise<void> {
    for (const h of this.listenerHandles) h.dispose();
    this.listenerHandles = [];

    const ids = [
      this.startState?.handleId,
      this.endState?.handleId,
      this.bezierHandleId,
      this.previewId,
    ].filter((id): id is string => id != null);

    for (const id of ids) {
      const node = await figma.getNodeByIdAsync(id);
      if (node && !node.removed) node.remove();
    }

    this.startState     = null;
    this.endState       = null;
    this.bezierHandleId = null;
    this.previewId      = null;
  }

  private makeHandle(pos: Vector, size: number, color: RGB, name: string): EllipseNode {
    const e = figma.createEllipse();
    e.resize(size, size);
    e.x = pos.x - size / 2;
    e.y = pos.y - size / 2;
    e.fills  = [{ type: 'SOLID', color }];
    e.strokes = [{ type: 'SOLID', color: WHITE }];
    e.strokeWeight = 2;
    e.name = name;
    return e;
  }

  private makePreview(p0: Vector, p1: Vector, p2: Vector): VectorNode {
    const v = figma.createVector();
    v.name   = '_road-placing-preview';
    v.locked = true;
    v.fills  = [];
    v.strokes = [{ type: 'SOLID', color: PREVIEW_STROKE }];
    v.strokeWeight = 2;
    const cubic = elevateToCubic({ p0, p1, p2 });
    v.vectorPaths = [{ windingRule: 'NONZERO', data: bezierPathData(cubic) }];
    return v;
  }
}
