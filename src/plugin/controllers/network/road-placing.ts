import type { NodeChangeListener, ListenerHandle } from "../listener";
import type { Node, Road } from "../../models/structures";
import type { Model } from "../../models";
import type { RoadCreationSnap } from "@/common/messages";
import { postMessageToUI } from "../../figma";
import { bezierPathData, CubicBezierPoints, QuadBezierPoints } from "../../utils/bezier";
import { absoluteOrigin } from "../../utils/math";

const START_SIZE   = 16;
const END_SIZE     = 16;
const BEZIER_SIZE  = 10;
const SNAP_RADIUS  = 24;
const MID_ROAD_T_MARGIN = 0.03;

const START_FILL:    RGB = { r: 1,    g: 0.4,  b: 0   };
const END_FILL:      RGB = { r: 0,    g: 0.7,  b: 0.3 };
const BEZIER_FILL:   RGB = { r: 0.08, g: 0.6,  b: 1   };
const WHITE:         RGB = { r: 1,    g: 1,    b: 1   };
const PREVIEW_STROKE:RGB = { r: 0.6,  g: 0.75, b: 1   };

// Where a dragged endpoint handle currently resolves to: an existing junction node,
// a point along an existing road's curve (splicing in a new junction on confirm), or
// nothing (a brand-new node will be created at the handle's raw position).
export type SnapTarget =
  | { kind: 'node'; node: Node }
  | { kind: 'road'; road: Road; t: number; pos: Vector };

interface EndpointState {
  handleId: string;
  pos:  Vector;
  snap: SnapTarget | null;
}

export interface RoadPlacingResult {
  startPos:  Vector;
  startSnap: SnapTarget | null;
  endPos:    Vector;
  endSnap:   SnapTarget | null;
  bezierPos: Vector;
}

export class RoadPlacingState {
  private startState:     EndpointState | null = null;
  private endState:       EndpointState | null = null;
  private bezierHandleId: string | null = null;
  private bezierPos:      Vector = { x: 0, y: 0 };
  private previewId:      string | null = null;
  private listenerHandles: ListenerHandle[] = [];
  private model:           Model | null = null;
  private snapEnabled = true;

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
    const preview      = this.makePreview(new QuadBezierPoints(startPos, bezierPos, endPos));

    figma.currentPage.appendChild(startHandle);
    figma.currentPage.appendChild(endHandle);
    figma.currentPage.appendChild(bezierHandle);
    figma.currentPage.appendChild(preview);

    this.startState     = { handleId: startHandle.id,  pos: startPos,  snap: null };
    this.endState       = { handleId: endHandle.id,    pos: endPos,    snap: null };
    this.bezierHandleId = bezierHandle.id;
    this.bezierPos      = bezierPos;
    this.previewId      = preview.id;
    this.model          = model;
    this.snapEnabled    = true;

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
    const origin = absoluteOrigin(h);
    const center = { x: origin.x + size / 2, y: origin.y + size / 2 };

    state.pos  = center;
    state.snap = this.findSnapTarget(center, model);

    await this.updatePreview();
    this.postSnapUpdate();
  }

  // Called by the UI to flip snapping on/off mid-session. Immediately re-resolves both
  // handles against their last known raw position so the preview/labels update right away.
  setSnapEnabled(enabled: boolean): void {
    this.snapEnabled = enabled;
    if (!this.model) return;
    if (this.startState) this.startState.snap = this.findSnapTarget(this.startState.pos, this.model);
    if (this.endState)   this.endState.snap   = this.findSnapTarget(this.endState.pos,   this.model);
    void this.updatePreview();
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
    const origin = absoluteOrigin(h);
    this.bezierPos = { x: origin.x + BEZIER_SIZE / 2, y: origin.y + BEZIER_SIZE / 2 };

    await this.updatePreview();
  }

  // Nearest node wins over nearest mid-road point at equal distance — plain node/node
  // connections are the common case and shouldn't get displaced by a near-tied splice.
  private findSnapTarget(pos: Vector, model: Model): SnapTarget | null {
    if (!this.snapEnabled) return null;

    let best: SnapTarget | null = null;
    let bestDist = SNAP_RADIUS;

    for (const node of model.state.getNodes()) {
      const c = this.nodeCenter(node);
      const dist = Math.hypot(c.x - pos.x, c.y - pos.y);
      if (dist <= bestDist) { bestDist = dist; best = { kind: 'node', node }; }
    }

    for (const road of model.state.getRoads()) {
      const bezier = road.computeBezier();
      if (!bezier) continue;
      const t = bezier.nearestT(pos);
      if (t < MID_ROAD_T_MARGIN || t > 1 - MID_ROAD_T_MARGIN) continue; // too close to an endpoint — let node snap handle it
      const p = bezier.eval(t);
      const dist = Math.hypot(p.x - pos.x, p.y - pos.y);
      if (dist < bestDist) { bestDist = dist; best = { kind: 'road', road, t, pos: p }; }
    }

    return best;
  }

  nodeCenter(node: Node): Vector {
    return node.position;
  }

  private effectivePos(state: EndpointState): Vector {
    if (!state.snap) return state.pos;
    return state.snap.kind === 'node' ? this.nodeCenter(state.snap.node) : state.snap.pos;
  }

  private async updatePreview(): Promise<void> {
    if (!this.previewId || !this.startState || !this.endState) return;
    const node = await figma.getNodeByIdAsync(this.previewId);
    if (!node || node.removed) return;
    const v = node as VectorNode;

    const p0    = this.effectivePos(this.startState);
    const p2    = this.effectivePos(this.endState);
    const cubic = new QuadBezierPoints(p0, this.bezierPos, p2).elevateToCubic();

    const tx = v.absoluteTransform[0][2];
    const ty = v.absoluteTransform[1][2];
    const local = (pt: Vector): Vector => ({ x: pt.x - tx, y: pt.y - ty });

    v.vectorPaths = [{
      windingRule: 'NONZERO',
      data: bezierPathData(new CubicBezierPoints(
        local(cubic.p0),
        local(cubic.p1),
        local(cubic.p2),
        local(cubic.p3)
      )),
    }];
  }

  private toSnapInfo(target: SnapTarget | null): RoadCreationSnap {
    if (!target) return null;
    return target.kind === 'node'
      ? { kind: 'node', nodeId: target.node.id, name: target.node.name }
      : { kind: 'road', roadId: target.road.id, name: target.road.name };
  }

  private postSnapUpdate(): void {
    postMessageToUI({
      type: 'road-creation-snap-update',
      startSnap: this.toSnapInfo(this.startState?.snap ?? null),
      endSnap:   this.toSnapInfo(this.endState?.snap ?? null),
    });
  }

  getResult(): RoadPlacingResult | null {
    if (!this.startState || !this.endState) return null;
    return {
      startPos:  this.effectivePos(this.startState),
      startSnap: this.startState.snap,
      endPos:    this.effectivePos(this.endState),
      endSnap:   this.endState.snap,
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
    this.model          = null;
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

  private makePreview(quad: QuadBezierPoints): VectorNode {
    const v = figma.createVector();
    v.name   = '_road-placing-preview';
    v.locked = true;
    v.fills  = [];
    v.strokes = [{ type: 'SOLID', color: PREVIEW_STROKE }];
    v.strokeWeight = 2;
    const cubic = quad.elevateToCubic();
    v.vectorPaths = [{ windingRule: 'NONZERO', data: bezierPathData(cubic) }];
    return v;
  }
}
