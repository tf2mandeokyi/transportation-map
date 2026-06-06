import { NodeId, RoadId } from "@/common/types";
import { MapState } from "../../models/structures";
import { Model } from "../../models";
import { FIGMA_KEY_IS_ROAD_CONTROL, FIGMA_KEY_ROAD_ID } from "../../views/road";
import { bezierPathData, offsetBezier, TRACK_SPACING } from "../../utils/bezier";

const ROAD_CONTROL_NODE_NAME = '_road-bezier-control';
export const FIGMA_KEY_BEZIER_HANDLE   = 'mapBezierHandle';   // value: 'start' | 'end'
export const FIGMA_KEY_ENDPOINT_HANDLE = 'mapEndpointHandle'; // value: 'start' | 'end'

const HANDLE_RADIUS = 5;
const BEZIER_HANDLE_FILL:     RGB = { r: 0.1,  g: 0.47, b: 1    };
const BEZIER_HANDLE_STROKE:   RGB = { r: 1,    g: 1,    b: 1    };
const ENDPOINT_HANDLE_FILL:   RGB = { r: 0.15, g: 0.15, b: 0.15 };
const ENDPOINT_HANDLE_STROKE: RGB = { r: 1,    g: 1,    b: 1    };
const STEM_STROKE:             RGB = { r: 0.6,  g: 0.75, b: 1    };

interface StemLineIds {
  startNodeStem: string;
  startStem:     string;
  endNodeStem:   string;
  endStem:       string;
}

interface HandleIds {
  startEndpoint: string;
  endEndpoint:   string;
  startBezier:   string;
  endBezier:     string;
}

export class RoadControlManager {
  private controlledRoadId: RoadId | null = null;
  private controlElementIds: string[] = [];
  private stemLineIds: StemLineIds | null = null;
  private handleIds: HandleIds | null = null;
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

    const p0 = road.endpoints[0].endpointPos;
    const p1 = road.endpoints[0].bezierPos;
    const p3 = road.endpoints[1].endpointPos;
    const p2 = road.endpoints[1].bezierPos;

    const roadGroup = figma.currentPage.children.find(n =>
      n.getPluginData(FIGMA_KEY_ROAD_ID) === roadId && n.getPluginData(FIGMA_KEY_IS_ROAD_CONTROL) !== 'true'
    );
    if (roadGroup && !roadGroup.removed) {
      (roadGroup as SceneNode).locked = true;
      this.lockedRoadNodeId = roadGroup.id;
    }

    const startCenter = this.computeNodeCenter(state, road.startNodeId);
    const endCenter   = this.computeNodeCenter(state, road.endNodeId);
    const startNodeStem = this.buildStemLine(startCenter, p0, roadId);
    const startStem     = this.buildStemLine(p0, p1, roadId);
    const endNodeStem   = this.buildStemLine(endCenter, p3, roadId);
    const endStem       = this.buildStemLine(p3, p2, roadId);
    figma.currentPage.appendChild(startNodeStem);
    figma.currentPage.appendChild(startStem);
    figma.currentPage.appendChild(endNodeStem);
    figma.currentPage.appendChild(endStem);

    const startEndpointHandle = this.buildEndpointHandle(p0, roadId, 'start');
    const endEndpointHandle   = this.buildEndpointHandle(p3, roadId, 'end');
    figma.currentPage.appendChild(startEndpointHandle);
    figma.currentPage.appendChild(endEndpointHandle);

    const startHandle = this.buildBezierHandle(p1, roadId, 'start');
    const endHandle   = this.buildBezierHandle(p2, roadId, 'end');
    figma.currentPage.appendChild(startHandle);
    figma.currentPage.appendChild(endHandle);

    this.controlledRoadId = roadId;
    this.stemLineIds = {
      startNodeStem: startNodeStem.id,
      startStem:     startStem.id,
      endNodeStem:   endNodeStem.id,
      endStem:       endStem.id,
    };
    this.handleIds = {
      startEndpoint: startEndpointHandle.id,
      endEndpoint:   endEndpointHandle.id,
      startBezier:   startHandle.id,
      endBezier:     endHandle.id,
    };
    this.controlElementIds = [
      startNodeStem.id, startStem.id, endNodeStem.id, endStem.id,
      startEndpointHandle.id, endEndpointHandle.id,
      startHandle.id, endHandle.id,
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
    this.handleIds = null;
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
    this.handleIds = null;
    this.controlledRoadId = null;
  }

  async onEndpointHandleMoved(roadId: RoadId, side: 'start' | 'end', handle: EllipseNode): Promise<void> {
    const handlePos = { x: handle.x + HANDLE_RADIUS, y: handle.y + HANDLE_RADIUS };
    const state = this.model.getState();
    const road = state.roads.get(roadId);
    if (!road) return;

    if (side === 'start') {
      const oldEp = road.endpoints[0].endpointPos;
      const delta = { x: handlePos.x - oldEp.x, y: handlePos.y - oldEp.y };
      this.model.updateRoadEndpoints(roadId, [
        { ...road.endpoints[0], endpointPos: handlePos, bezierPos: { x: road.endpoints[0].bezierPos.x + delta.x, y: road.endpoints[0].bezierPos.y + delta.y } },
        road.endpoints[1],
      ]);
    } else {
      const oldEp = road.endpoints[1].endpointPos;
      const delta = { x: handlePos.x - oldEp.x, y: handlePos.y - oldEp.y };
      this.model.updateRoadEndpoints(roadId, [
        road.endpoints[0],
        { ...road.endpoints[1], endpointPos: handlePos, bezierPos: { x: road.endpoints[1].bezierPos.x + delta.x, y: road.endpoints[1].bezierPos.y + delta.y } },
      ]);
    }

    await this.updateRoadAndStems(roadId, 'endpoint', side);
  }

  async onBezierHandleMoved(roadId: RoadId, side: 'start' | 'end', handle: EllipseNode): Promise<void> {
    const handlePos = { x: handle.x + HANDLE_RADIUS, y: handle.y + HANDLE_RADIUS };
    const state = this.model.getState();
    const road = state.roads.get(roadId);
    if (!road) return;

    if (side === 'start') {
      this.model.updateRoadEndpoints(roadId, [
        { ...road.endpoints[0], bezierPos: handlePos },
        road.endpoints[1],
      ]);
    } else {
      this.model.updateRoadEndpoints(roadId, [
        road.endpoints[0],
        { ...road.endpoints[1], bezierPos: handlePos },
      ]);
    }

    await this.updateRoadAndStems(roadId, 'bezier', side);
  }

  private async updateRoadAndStems(
    roadId: RoadId,
    movedType: 'endpoint' | 'bezier',
    movedSide: 'start' | 'end',
  ): Promise<void> {
    const state = this.model.getState();
    const road = state.roads.get(roadId);
    if (!road) return;

    const p0 = road.endpoints[0].endpointPos;
    const p1 = road.endpoints[0].bezierPos;
    const p3 = road.endpoints[1].endpointPos;
    const p2 = road.endpoints[1].bezierPos;

    if (this.stemLineIds) {
      const ids = this.stemLineIds;
      const updateStem = async (id: string, from: Vector, to: Vector) => {
        const node = await figma.getNodeByIdAsync(id) as VectorNode | null;
        if (!node || node.removed) return;
        // vectorPaths use local coordinates; subtract the node's absolute page origin to convert
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
      await updateStem(ids.startStem,     p0, p1);
      await updateStem(ids.endNodeStem,   endCenter, p3);
      await updateStem(ids.endStem,       p3, p2);
    }

    // When an endpoint moves, p1 or p2 shifts with it — reposition the corresponding bezier handle
    if (movedType === 'endpoint' && this.handleIds) {
      this.suppressNextControlChanges = true;
      const bezierHandleId = movedSide === 'start' ? this.handleIds.startBezier : this.handleIds.endBezier;
      const newPos = movedSide === 'start' ? p1 : p2;
      const node = await figma.getNodeByIdAsync(bezierHandleId) as EllipseNode | null;
      if (node && !node.removed) {
        node.x = newPos.x - HANDLE_RADIUS;
        node.y = newPos.y - HANDLE_RADIUS;
      }
    }

    const roadGroup = figma.currentPage.children.find(n =>
      n.getPluginData(FIGMA_KEY_ROAD_ID) === roadId && n.getPluginData(FIGMA_KEY_IS_ROAD_CONTROL) !== 'true'
    );
    if (!roadGroup || roadGroup.removed || !('children' in roadGroup)) return;

    const group = roadGroup as GroupNode;
    const sections = Array.from(road.sections.values()).sort((a, b) => a.index - b.index);
    const children = group.children;

    // Helper: convert page-space bezier points to a VectorNode's local space using absoluteTransform
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
          data: bezierPathData(toLocalBezier(child, { p0, p1, p2, p3 })),
        }];
      }
    } else {
      const center = (sections.length - 1) / 2;
      sections.forEach((section, i) => {
        const offset = (section.index - center) * TRACK_SPACING;
        const o = offsetBezier({ p0, p1, p2, p3 }, offset);
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

  private buildBezierHandle(pos: Vector, roadId: RoadId, side: 'start' | 'end'): EllipseNode {
    const ellipse = figma.createEllipse();
    ellipse.resize(HANDLE_RADIUS * 2, HANDLE_RADIUS * 2);
    ellipse.x = pos.x - HANDLE_RADIUS;
    ellipse.y = pos.y - HANDLE_RADIUS;
    ellipse.fills   = [{ type: 'SOLID', color: BEZIER_HANDLE_FILL }];
    ellipse.strokes = [{ type: 'SOLID', color: BEZIER_HANDLE_STROKE }];
    ellipse.strokeWeight = 1.5;
    ellipse.name = `Bezier: ${side}`;
    ellipse.setPluginData(FIGMA_KEY_ROAD_ID, roadId);
    ellipse.setPluginData(FIGMA_KEY_IS_ROAD_CONTROL, 'true');
    ellipse.setPluginData(FIGMA_KEY_BEZIER_HANDLE, side);
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
