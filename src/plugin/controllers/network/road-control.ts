import { NodeId, RoadId } from "@/common/types";
import { MapState } from "../../models/structures";
import { Model } from "../../models";
import { FIGMA_KEY_IS_ROAD_CONTROL, FIGMA_KEY_ROAD_ID } from "../../views/road";
import { elevateToCubic, bezierPathData, offsetBezier, TRACK_SPACING } from "../../utils/bezier";

const ROAD_CONTROL_NODE_NAME = '_road-bezier-control';
export const FIGMA_KEY_BEZIER_HANDLE   = 'mapBezierHandle';   // value: 'mid'
export const FIGMA_KEY_ENDPOINT_HANDLE = 'mapEndpointHandle'; // value: 'start' | 'end'

const HANDLE_RADIUS = 5;
const BEZIER_HANDLE_FILL:     RGB = { r: 0.1,  g: 0.47, b: 1    };
const BEZIER_HANDLE_STROKE:   RGB = { r: 1,    g: 1,    b: 1    };
const ENDPOINT_HANDLE_FILL:   RGB = { r: 0.15, g: 0.15, b: 0.15 };
const ENDPOINT_HANDLE_STROKE: RGB = { r: 1,    g: 1,    b: 1    };
const STEM_STROKE:             RGB = { r: 0.6,  g: 0.75, b: 1    };

interface StemLineIds {
  startNodeStem: string;
  startToMid:    string;
  endNodeStem:   string;
  endToMid:      string;
}

export class RoadControlManager {
  private controlledRoadId: RoadId | null = null;
  private controlElementIds: string[] = [];
  private stemLineIds: StemLineIds | null = null;
  private lockedRoadNodeId: string | null = null;
  public suppressNextControlChanges = false;

  constructor(private readonly model: Model) {}

  get activeRoadId(): RoadId | null { return this.controlledRoadId; }

  isControlElement(id: string): boolean {
    return this.controlElementIds.includes(id);
  }

  async activate(roadId: RoadId): Promise<void> {
    await this.remove();

    const state = this.model.getState();
    const road = state.roads.get(roadId);
    if (!road) return;

    const startNode = state.nodes.get(road.startNodeId);
    const endNode   = state.nodes.get(road.endNodeId);
    if (!startNode || !endNode) return;

    const p0  = road.endpoints[0].endpointPos;
    const mid = road.bezierMidPoint;
    const p2  = road.endpoints[1].endpointPos;

    const roadGroup = figma.currentPage.children.find(n =>
      n.getPluginData(FIGMA_KEY_ROAD_ID) === roadId && n.getPluginData(FIGMA_KEY_IS_ROAD_CONTROL) !== 'true'
    );
    if (roadGroup && !roadGroup.removed) {
      (roadGroup as SceneNode).locked = true;
      this.lockedRoadNodeId = roadGroup.id;
    }

    const startCenter = this.computeNodeCenter(state, road.startNodeId);
    const endCenter   = this.computeNodeCenter(state, road.endNodeId);
    const startNodeStem = this.buildStemLine(startCenter, p0,  roadId);
    const startToMid    = this.buildStemLine(p0, mid, roadId);
    const endNodeStem   = this.buildStemLine(endCenter,   p2,  roadId);
    const endToMid      = this.buildStemLine(p2, mid, roadId);
    figma.currentPage.appendChild(startNodeStem);
    figma.currentPage.appendChild(startToMid);
    figma.currentPage.appendChild(endNodeStem);
    figma.currentPage.appendChild(endToMid);

    const startEndpointHandle = this.buildEndpointHandle(p0, roadId, 'start');
    const endEndpointHandle   = this.buildEndpointHandle(p2, roadId, 'end');
    figma.currentPage.appendChild(startEndpointHandle);
    figma.currentPage.appendChild(endEndpointHandle);

    const midHandle = this.buildBezierHandle(mid, roadId);
    figma.currentPage.appendChild(midHandle);

    this.controlledRoadId = roadId;
    this.stemLineIds = {
      startNodeStem: startNodeStem.id,
      startToMid:    startToMid.id,
      endNodeStem:   endNodeStem.id,
      endToMid:      endToMid.id,
    };
    this.controlElementIds = [
      startNodeStem.id, startToMid.id, endNodeStem.id, endToMid.id,
      startEndpointHandle.id, endEndpointHandle.id,
      midHandle.id,
    ];
    this.suppressNextControlChanges = true;
  }

  async remove(): Promise<void> {
    if (this.lockedRoadNodeId) {
      const roadNode = await figma.getNodeByIdAsync(this.lockedRoadNodeId);
      if (roadNode && !roadNode.removed) (roadNode as SceneNode).locked = false;
      this.lockedRoadNodeId = null;
    }
    for (const id of this.controlElementIds) {
      const node = await figma.getNodeByIdAsync(id);
      if (node && !node.removed) node.remove();
    }
    this.controlElementIds = [];
    this.stemLineIds = null;

    this.controlledRoadId = null;
  }

  cleanup(): void {
    if (this.lockedRoadNodeId) {
      const roadNode = figma.currentPage.children.find(n => n.id === this.lockedRoadNodeId);
      if (roadNode && !roadNode.removed) (roadNode as SceneNode).locked = false;
      this.lockedRoadNodeId = null;
    }
    figma.currentPage
      .findAll(n => n.getPluginData(FIGMA_KEY_IS_ROAD_CONTROL) === 'true')
      .forEach(n => { if (!n.removed) n.remove(); });
    this.controlElementIds = [];
    this.stemLineIds = null;

    this.controlledRoadId = null;
  }

  async onEndpointHandleMoved(roadId: RoadId, side: 'start' | 'end', handle: EllipseNode): Promise<void> {
    const handlePos = { x: handle.x + HANDLE_RADIUS, y: handle.y + HANDLE_RADIUS };
    const state = this.model.getState();
    const road = state.roads.get(roadId);
    if (!road) return;

    if (side === 'start') {
      this.model.updateRoadEndpoints(roadId, [
        { ...road.endpoints[0], endpointPos: handlePos },
        road.endpoints[1],
      ]);
    } else {
      this.model.updateRoadEndpoints(roadId, [
        road.endpoints[0],
        { ...road.endpoints[1], endpointPos: handlePos },
      ]);
    }

    await this.updateRoadAndStems(roadId);
  }

  async onBezierHandleMoved(roadId: RoadId, handle: EllipseNode): Promise<void> {
    const handlePos = { x: handle.x + HANDLE_RADIUS, y: handle.y + HANDLE_RADIUS };
    this.model.updateRoadBezierMidPoint(roadId, handlePos);
    await this.updateRoadAndStems(roadId);
  }

  private async updateRoadAndStems(roadId: RoadId): Promise<void> {
    const state = this.model.getState();
    const road = state.roads.get(roadId);
    if (!road) return;

    const p0  = road.endpoints[0].endpointPos;
    const mid = road.bezierMidPoint;
    const p2  = road.endpoints[1].endpointPos;
    const cubic = elevateToCubic({ p0, p1: mid, p2 });

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
      const startCenter = this.computeNodeCenter(state, road.startNodeId);
      const endCenter   = this.computeNodeCenter(state, road.endNodeId);
      await updateStem(ids.startNodeStem, startCenter, p0);
      await updateStem(ids.startToMid,   p0,  mid);
      await updateStem(ids.endNodeStem,   endCenter,   p2);
      await updateStem(ids.endToMid,     p2,  mid);
    }

    const roadGroup = figma.currentPage.children.find(n =>
      n.getPluginData(FIGMA_KEY_ROAD_ID) === roadId && n.getPluginData(FIGMA_KEY_IS_ROAD_CONTROL) !== 'true'
    );
    if (!roadGroup || roadGroup.removed || !('children' in roadGroup)) return;

    const group = roadGroup as GroupNode;
    const sections = Array.from(road.sections.values()).sort((a, b) => a.index - b.index);
    const children = group.children;

    const toLocalBezier = (child: VectorNode, pts: { p0: Vector; p1: Vector; p2: Vector; p3: Vector }) => {
      const tx = child.absoluteTransform[0][2];
      const ty = child.absoluteTransform[1][2];
      const l = (v: Vector): Vector => ({ x: v.x - tx, y: v.y - ty });
      return { p0: l(pts.p0), p1: l(pts.p1), p2: l(pts.p2), p3: l(pts.p3) };
    };

    if (sections.length === 0) {
      const child = children[0] as VectorNode | undefined;
      if (child) {
        child.vectorPaths = [{
          windingRule: 'NONZERO',
          data: bezierPathData(toLocalBezier(child, cubic)),
        }];
      }
    } else {
      const center = (sections.length - 1) / 2;
      sections.forEach((section, i) => {
        const offset = (section.index - center) * TRACK_SPACING;
        const o = offsetBezier(cubic, offset);
        const child = children[i] as VectorNode | undefined;
        if (child) {
          child.vectorPaths = [{
            windingRule: 'NONZERO',
            data: bezierPathData(toLocalBezier(child, o)),
          }];
        }
      });
    }
  }

  private computeNodeCenter(state: Readonly<MapState>, nodeId: NodeId): Vector {
    const node = state.nodes.get(nodeId);
    if (!node || node.roadConnections.length === 0) return { x: 0, y: 0 };
    let sumX = 0, sumY = 0, count = 0;
    for (const { roadId, endpointIndex } of node.roadConnections) {
      const road = state.roads.get(roadId);
      if (!road) continue;
      sumX += road.endpoints[endpointIndex].endpointPos.x;
      sumY += road.endpoints[endpointIndex].endpointPos.y;
      count++;
    }
    return count > 0 ? { x: sumX / count, y: sumY / count } : { x: 0, y: 0 };
  }

  private buildEndpointHandle(pos: Vector, roadId: RoadId, side: 'start' | 'end'): EllipseNode {
    const ellipse = figma.createEllipse();
    ellipse.resize(HANDLE_RADIUS * 2, HANDLE_RADIUS * 2);
    ellipse.x = pos.x - HANDLE_RADIUS;
    ellipse.y = pos.y - HANDLE_RADIUS;
    ellipse.fills   = [{ type: 'SOLID', color: ENDPOINT_HANDLE_FILL }];
    ellipse.strokes = [{ type: 'SOLID', color: ENDPOINT_HANDLE_STROKE }];
    ellipse.strokeWeight = 1.5;
    ellipse.name = `Endpoint: ${side}`;
    ellipse.setPluginData(FIGMA_KEY_ROAD_ID, roadId);
    ellipse.setPluginData(FIGMA_KEY_IS_ROAD_CONTROL, 'true');
    ellipse.setPluginData(FIGMA_KEY_ENDPOINT_HANDLE, side);
    return ellipse;
  }

  private buildBezierHandle(pos: Vector, roadId: RoadId): EllipseNode {
    const ellipse = figma.createEllipse();
    ellipse.resize(HANDLE_RADIUS * 2, HANDLE_RADIUS * 2);
    ellipse.x = pos.x - HANDLE_RADIUS;
    ellipse.y = pos.y - HANDLE_RADIUS;
    ellipse.fills   = [{ type: 'SOLID', color: BEZIER_HANDLE_FILL }];
    ellipse.strokes = [{ type: 'SOLID', color: BEZIER_HANDLE_STROKE }];
    ellipse.strokeWeight = 1.5;
    ellipse.name = 'Bezier: mid';
    ellipse.setPluginData(FIGMA_KEY_ROAD_ID, roadId);
    ellipse.setPluginData(FIGMA_KEY_IS_ROAD_CONTROL, 'true');
    ellipse.setPluginData(FIGMA_KEY_BEZIER_HANDLE, 'mid');
    return ellipse;
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
