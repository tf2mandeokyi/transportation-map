import { RoadId } from "@/common/types";
import { Model } from "../../models";
import { FIGMA_KEY_IS_ROAD_CONTROL, FIGMA_KEY_ROAD_ID, FIGMA_KEY_SECTION_ID } from "../../views/road";
import { renderEditHandle } from "../../figmls";
import { bezierPathData, CubicBezierPoints, QuadBezierPoints } from "../../utils/bezier";
import { normalize, perp, dot, absoluteOrigin } from "../../utils/math";

const ROAD_CONTROL_NODE_NAME = '_road-bezier-control';
export const FIGMA_KEY_BEZIER_HANDLE = 'mapBezierHandle';
export const FIGMA_KEY_OFFSET_HANDLE = 'mapOffsetHandle';

const HANDLE_RADIUS = 5;
const STEM_STROKE:  RGB = { r: 0.6,  g: 0.75, b: 1 };

interface StemLineIds {
  startNodeStem: string;
  startToMid:    string;
  endNodeStem:   string;
  endToMid:      string;
}

interface OffsetHandleIds {
  start: string;
  end:   string;
}

export class RoadControlManager {
  private controlledRoadId: RoadId | null = null;
  private controlElementIds: string[] = [];
  private stemLineIds: StemLineIds | null = null;
  private offsetHandleIds: OffsetHandleIds | null = null;
  private lockedRoadNodeIds: string[] = [];
  public suppressNextControlChanges = false;

  constructor(private readonly model: Model) {}

  get activeRoadId(): RoadId | null { return this.controlledRoadId; }

  isControlElement(id: string): boolean {
    return this.controlElementIds.includes(id);
  }

  async activate(roadId: RoadId): Promise<void> {
    await this.remove();

    const state = this.model.state;
    const road = state.getRoad(roadId);
    if (!road) return;

    const startNode = road.endpoints[0].node;
    const endNode   = road.endpoints[1].node;
    if (!startNode || !endNode) return;

    const p0  = road.computeEndpointPos(0);
    const mid = road.bezierMidPoint;
    const p2  = road.computeEndpointPos(1);

    const roadVisualNodes = this.findRoadVisualNodes(roadId);
    for (const n of roadVisualNodes) n.locked = true;
    this.lockedRoadNodeIds = roadVisualNodes.map(n => n.id);

    const startNodeStem = this.buildStemLine(startNode.position, p0, roadId);
    const startToMid    = this.buildStemLine(p0, mid, roadId);
    const endNodeStem   = this.buildStemLine(endNode.position,   p2, roadId);
    const endToMid      = this.buildStemLine(p2, mid, roadId);
    figma.currentPage.appendChild(startNodeStem);
    figma.currentPage.appendChild(startToMid);
    figma.currentPage.appendChild(endNodeStem);
    figma.currentPage.appendChild(endToMid);

    const startOffsetHandle = await this.buildOffsetHandle(p0, roadId, 'start');
    const endOffsetHandle   = await this.buildOffsetHandle(p2, roadId, 'end');
    figma.currentPage.appendChild(startOffsetHandle);
    figma.currentPage.appendChild(endOffsetHandle);

    const midHandle = await this.buildBezierHandle(mid, roadId);
    figma.currentPage.appendChild(midHandle);

    this.controlledRoadId = roadId;
    this.stemLineIds = {
      startNodeStem: startNodeStem.id,
      startToMid:    startToMid.id,
      endNodeStem:   endNodeStem.id,
      endToMid:      endToMid.id,
    };
    this.offsetHandleIds = {
      start: startOffsetHandle.id,
      end:   endOffsetHandle.id,
    };
    this.controlElementIds = [
      startNodeStem.id, startToMid.id, endNodeStem.id, endToMid.id,
      startOffsetHandle.id, endOffsetHandle.id,
      midHandle.id,
    ];
    this.suppressNextControlChanges = true;
  }

  async remove(): Promise<void> {
    for (const id of this.lockedRoadNodeIds) {
      const roadNode = await figma.getNodeByIdAsync(id);
      if (roadNode && !roadNode.removed) (roadNode as SceneNode).locked = false;
    }
    this.lockedRoadNodeIds = [];
    for (const id of this.controlElementIds) {
      const node = await figma.getNodeByIdAsync(id);
      if (node && !node.removed) node.remove();
    }
    this.controlElementIds = [];
    this.stemLineIds = null;
    this.offsetHandleIds = null;
    this.controlledRoadId = null;
  }

  cleanup(): void {
    for (const id of this.lockedRoadNodeIds) {
      const roadNode = figma.currentPage.children.find(n => n.id === id);
      if (roadNode && !roadNode.removed) (roadNode as SceneNode).locked = false;
    }
    this.lockedRoadNodeIds = [];
    figma.currentPage
      .findAll(n => n.getPluginData(FIGMA_KEY_IS_ROAD_CONTROL) === 'true')
      .forEach(n => { if (!n.removed) n.remove(); });
    this.controlElementIds = [];
    this.stemLineIds = null;
    this.offsetHandleIds = null;
    this.controlledRoadId = null;
  }

  private findRoadVisualNodes(roadId: RoadId): SceneNode[] {
    return figma.currentPage.children.filter(n =>
      n.getPluginData(FIGMA_KEY_ROAD_ID) === roadId && n.getPluginData(FIGMA_KEY_IS_ROAD_CONTROL) !== 'true'
    );
  }

  // Only the component of the drag along the node's tangent direction affects horizontalOffset;
  // any drift along the normal is discarded and the handle snaps back onto the tangent line.
  async onOffsetHandleMoved(roadId: RoadId, side: 'start' | 'end', handle: FrameNode): Promise<void> {
    const handleOrigin = absoluteOrigin(handle);
    const draggedPos = { x: handleOrigin.x + HANDLE_RADIUS, y: handleOrigin.y + HANDLE_RADIUS };
    const state = this.model.state;
    const road = state.getRoad(roadId);
    if (!road) return;

    const endpointIndex = side === 'start' ? 0 : 1;
    const conn = road.endpoints[endpointIndex];
    const node = conn.node;

    const normal  = normalize({ x: road.bezierMidPoint.x - node.position.x, y: road.bezierMidPoint.y - node.position.y });
    const tangent = perp(normal);
    const anchor  = { x: node.position.x + normal.x * node.radius, y: node.position.y + normal.y * node.radius };
    const offsetVec = { x: draggedPos.x - anchor.x, y: draggedPos.y - anchor.y };
    conn.horizontalOffset = dot(offsetVec, tangent);

    const resolvedPos = road.computeEndpointPos(endpointIndex);
    handle.x = resolvedPos.x - HANDLE_RADIUS;
    handle.y = resolvedPos.y - HANDLE_RADIUS;

    await this.updateRoadAndStems(roadId);
  }

  async onBezierHandleMoved(roadId: RoadId, handle: FrameNode): Promise<void> {
    const origin = absoluteOrigin(handle);
    const handlePos = { x: origin.x + HANDLE_RADIUS, y: origin.y + HANDLE_RADIUS };
    const road = this.model.state.getRoad(roadId);
    if (!road) return;
    road.bezierMidPoint = handlePos;
    await this.updateRoadAndStems(roadId);
  }

  private async updateRoadAndStems(roadId: RoadId): Promise<void> {
    const state = this.model.state;
    const road = state.getRoad(roadId);
    if (!road) return;

    const p0  = road.computeEndpointPos(0);
    const mid = road.bezierMidPoint;
    const p2  = road.computeEndpointPos(1);
    const cubic = new QuadBezierPoints(p0, mid, p2).elevateToCubic();

    if (this.stemLineIds) {
      const ids = this.stemLineIds;
      const updateStem = async (id: string, from: Vector, to: Vector) => {
        const node = await figma.getNodeByIdAsync(id) as VectorNode | null;
        if (!node || node.removed) return;
        const tx = node.absoluteTransform[0][2];
        const ty = node.absoluteTransform[1][2];
        node.vectorPaths = [{
          windingRule: 'NONZERO',
          data: `M ${from.x - tx} ${from.y - ty} L ${to.x - tx} ${to.y - ty}`,
        }];
      };
      await updateStem(ids.startNodeStem, road.endpoints[0].node.position, p0);
      await updateStem(ids.startToMid,   p0,  mid);
      await updateStem(ids.endNodeStem,   road.endpoints[1].node.position, p2);
      await updateStem(ids.endToMid,     p2,  mid);
    }

    if (this.offsetHandleIds) {
      const moveHandle = async (id: string, pos: Vector) => {
        const node = await figma.getNodeByIdAsync(id) as FrameNode | null;
        if (!node || node.removed) return;
        node.x = pos.x - HANDLE_RADIUS;
        node.y = pos.y - HANDLE_RADIUS;
      };
      await moveHandle(this.offsetHandleIds.start, p0);
      await moveHandle(this.offsetHandleIds.end,   p2);
    }

    const roadVisualNodes = this.findRoadVisualNodes(roadId) as VectorNode[];
    const sections = road.getSectionsByIndex();

    const toLocalBezier = (child: VectorNode, pts: { p0: Vector; p1: Vector; p2: Vector; p3: Vector }) => {
      const tx = child.absoluteTransform[0][2];
      const ty = child.absoluteTransform[1][2];
      const l = (v: Vector): Vector => ({ x: v.x - tx, y: v.y - ty });
      return new CubicBezierPoints(l(pts.p0), l(pts.p1), l(pts.p2), l(pts.p3));
    };

    if (sections.length === 0) {
      const child = roadVisualNodes.find(n => !n.getPluginData(FIGMA_KEY_SECTION_ID));
      if (child) {
        child.vectorPaths = [{
          windingRule: 'NONZERO',
          data: bezierPathData(toLocalBezier(child, cubic)),
        }];
      }
    } else {
      for (const section of sections) {
        const child = roadVisualNodes.find(n => n.getPluginData(FIGMA_KEY_SECTION_ID) === section.id);
        if (!child) continue;
        const offset = section.computeOffset();
        const o = cubic.offset(offset);
        child.vectorPaths = [{
          windingRule: 'NONZERO',
          data: bezierPathData(toLocalBezier(child, o)),
        }];
      }
    }
  }

  private async buildOffsetHandle(pos: Vector, roadId: RoadId, side: 'start' | 'end'): Promise<FrameNode> {
    const frame = await renderEditHandle({ fill: '#262626', size: HANDLE_RADIUS * 2 }).intoNode() as FrameNode;
    frame.x = pos.x - HANDLE_RADIUS;
    frame.y = pos.y - HANDLE_RADIUS;
    frame.name = `Offset: ${side}`;
    frame.setPluginData(FIGMA_KEY_ROAD_ID, roadId);
    frame.setPluginData(FIGMA_KEY_IS_ROAD_CONTROL, 'true');
    frame.setPluginData(FIGMA_KEY_OFFSET_HANDLE, side);
    return frame;
  }

  private async buildBezierHandle(pos: Vector, roadId: RoadId): Promise<FrameNode> {
    const frame = await renderEditHandle({ fill: '#1A78FF', size: HANDLE_RADIUS * 2 }).intoNode() as FrameNode;
    frame.x = pos.x - HANDLE_RADIUS;
    frame.y = pos.y - HANDLE_RADIUS;
    frame.name = 'Bezier: mid';
    frame.setPluginData(FIGMA_KEY_ROAD_ID, roadId);
    frame.setPluginData(FIGMA_KEY_IS_ROAD_CONTROL, 'true');
    frame.setPluginData(FIGMA_KEY_BEZIER_HANDLE, 'mid');
    return frame;
  }

  private buildStemLine(from: Vector, to: Vector, roadId: RoadId): VectorNode {
    const v = figma.createVector();
    v.name = `${ROAD_CONTROL_NODE_NAME}-stem`;
    v.vectorPaths = [{ windingRule: 'NONZERO', data: `M ${from.x} ${from.y} L ${to.x} ${to.y}` }];
    v.fills = [];
    v.strokes = [{ type: 'SOLID', color: STEM_STROKE }];
    v.strokeWeight = 1;
    v.locked = true;
    v.setPluginData(FIGMA_KEY_ROAD_ID, roadId);
    v.setPluginData(FIGMA_KEY_IS_ROAD_CONTROL, 'true');
    return v;
  }
}
