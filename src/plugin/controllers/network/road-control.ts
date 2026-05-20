import { RoadId } from "@/common/types";
import { Model } from "../../models";
import { FIGMA_KEY_IS_ROAD_CONTROL, FIGMA_KEY_ROAD_ID } from "../../views/road";

const ROAD_CONTROL_NODE_NAME = '_road-bezier-control';
export const FIGMA_KEY_BEZIER_HANDLE   = 'mapBezierHandle';   // value: 'start' | 'end'
export const FIGMA_KEY_ENDPOINT_HANDLE = 'mapEndpointHandle'; // value: 'start' | 'end'

const HANDLE_RADIUS = 5;
const BEZIER_HANDLE_FILL:     RGB = { r: 0.1,  g: 0.47, b: 1    };
const BEZIER_HANDLE_STROKE:   RGB = { r: 1,    g: 1,    b: 1    };
const ENDPOINT_HANDLE_FILL:   RGB = { r: 0.15, g: 0.15, b: 0.15 };
const ENDPOINT_HANDLE_STROKE: RGB = { r: 1,    g: 1,    b: 1    };
const STEM_STROKE:             RGB = { r: 0.6,  g: 0.75, b: 1    };

export class RoadControlManager {
  private controlledRoadId: RoadId | null = null;
  private controlElementIds: string[] = [];
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

    const p0 = { x: startNode.pos.x + road.endpoints[0].endpointDisplacement.x, y: startNode.pos.y + road.endpoints[0].endpointDisplacement.y };
    const p1 = { x: p0.x + road.endpoints[0].bezierDisplacement.x, y: p0.y + road.endpoints[0].bezierDisplacement.y };
    const p3 = { x: endNode.pos.x + road.endpoints[1].endpointDisplacement.x, y: endNode.pos.y + road.endpoints[1].endpointDisplacement.y };
    const p2 = { x: p3.x + road.endpoints[1].bezierDisplacement.x, y: p3.y + road.endpoints[1].bezierDisplacement.y };

    const vector = figma.createVector();
    vector.name = ROAD_CONTROL_NODE_NAME;
    vector.vectorPaths = [{ windingRule: 'NONZERO', data: `M ${p0.x} ${p0.y} C ${p1.x} ${p1.y} ${p2.x} ${p2.y} ${p3.x} ${p3.y}` }];
    vector.fills = [];
    vector.strokes = [{ type: 'SOLID', color: { r: 0.1, g: 0.47, b: 1 } }];
    vector.strokeWeight = 2;
    vector.strokeCap = 'ROUND';
    vector.dashPattern = [6, 4];
    vector.setPluginData(FIGMA_KEY_ROAD_ID, roadId);
    vector.setPluginData(FIGMA_KEY_IS_ROAD_CONTROL, 'true');
    figma.currentPage.appendChild(vector);

    const startNodeStem = this.buildStemLine(startNode.pos, p0, roadId);
    const startStem     = this.buildStemLine(p0, p1, roadId);
    const endNodeStem   = this.buildStemLine(endNode.pos, p3, roadId);
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

    this.controlledRoadId  = roadId;
    this.controlElementIds = [
      vector.id,
      startNodeStem.id, startStem.id, endNodeStem.id, endStem.id,
      startEndpointHandle.id, endEndpointHandle.id,
      startHandle.id, endHandle.id,
    ];
    this.suppressNextControlChanges = true;
  }

  async remove(): Promise<void> {
    for (const id of this.controlElementIds) {
      const node = await figma.getNodeByIdAsync(id);
      if (node && !node.removed) node.remove();
    }
    this.controlElementIds = [];
    this.controlledRoadId  = null;
  }

  cleanup(): void {
    figma.currentPage
      .findAll(n => n.getPluginData(FIGMA_KEY_IS_ROAD_CONTROL) === 'true')
      .forEach(n => { if (!n.removed) n.remove(); });
    this.controlElementIds = [];
    this.controlledRoadId  = null;
  }

  async onEndpointHandleMoved(roadId: RoadId, side: 'start' | 'end', handle: EllipseNode): Promise<void> {
    const handlePos = { x: handle.x + HANDLE_RADIUS, y: handle.y + HANDLE_RADIUS };
    const state = this.model.getState();
    const road = state.roads.get(roadId);
    if (!road) return;

    if (side === 'start') {
      const startNode = state.nodes.get(road.startNodeId);
      if (!startNode) return;
      this.model.updateRoadEndpoints(roadId, [
        { ...road.endpoints[0], endpointDisplacement: { x: handlePos.x - startNode.pos.x, y: handlePos.y - startNode.pos.y } },
        road.endpoints[1],
      ]);
    } else {
      const endNode = state.nodes.get(road.endNodeId);
      if (!endNode) return;
      this.model.updateRoadEndpoints(roadId, [
        road.endpoints[0],
        { ...road.endpoints[1], endpointDisplacement: { x: handlePos.x - endNode.pos.x, y: handlePos.y - endNode.pos.y } },
      ]);
    }
  }

  async onBezierHandleMoved(roadId: RoadId, side: 'start' | 'end', handle: EllipseNode): Promise<void> {
    const handlePos = { x: handle.x + HANDLE_RADIUS, y: handle.y + HANDLE_RADIUS };
    const state = this.model.getState();
    const road = state.roads.get(roadId);
    if (!road) return;

    if (side === 'start') {
      const startNode = state.nodes.get(road.startNodeId);
      if (!startNode) return;
      const p0 = { x: startNode.pos.x + road.endpoints[0].endpointDisplacement.x, y: startNode.pos.y + road.endpoints[0].endpointDisplacement.y };
      this.model.updateRoadEndpoints(roadId, [
        { ...road.endpoints[0], bezierDisplacement: { x: handlePos.x - p0.x, y: handlePos.y - p0.y } },
        road.endpoints[1],
      ]);
    } else {
      const endNode = state.nodes.get(road.endNodeId);
      if (!endNode) return;
      const p3 = { x: endNode.pos.x + road.endpoints[1].endpointDisplacement.x, y: endNode.pos.y + road.endpoints[1].endpointDisplacement.y };
      this.model.updateRoadEndpoints(roadId, [
        road.endpoints[0],
        { ...road.endpoints[1], bezierDisplacement: { x: handlePos.x - p3.x, y: handlePos.y - p3.y } },
      ]);
    }
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
    v.setPluginData(FIGMA_KEY_ROAD_ID, roadId);
    v.setPluginData(FIGMA_KEY_IS_ROAD_CONTROL, 'true');
    return v;
  }
}
