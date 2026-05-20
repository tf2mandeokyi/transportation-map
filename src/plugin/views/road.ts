import { MapState, Node, Road } from "../models/structures";
import { Model } from "../models";
import { offsetBezier, bezierPathData, TRACK_SPACING, ROAD_MIN_WIDTH } from "../utils/bezier";
import { getLinesForSection, sectionBandWidth } from "../utils/section";

export const NODE_RADIUS = 4;
export const FIGMA_KEY_NODE_ID      = 'mapNodeId';
export const FIGMA_KEY_ROAD_ID      = 'mapRoadId';
export const FIGMA_KEY_IS_ROAD_CONTROL = 'isRoadControl';

// Legacy group name kept so old renders from previous sessions can be cleaned up.
const ROAD_NETWORK_GROUP_NAME = '_road-network';

const SECTION_COLOR: RGB = { r: 0.82, g: 0.82, b: 0.82 };
const NODE_FILL: RGB   = { r: 0.2, g: 0.2, b: 0.2 };
const NODE_STROKE: RGB = { r: 1, g: 1, b: 1 };

export class RoadRenderer {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public setModel(_model: Model): void {}

  public async renderAll(state: Readonly<MapState>): Promise<void> {
    await this.clearPrevious();

    // Road groups go to the bottom of the page (inserted at index 0).
    for (const road of state.roads.values()) {
      const sectionNodes = this.buildRoadVisuals(road, state);
      if (sectionNodes.length === 0) continue;

      const group = figma.group(sectionNodes, figma.currentPage);
      group.name = `Road: ${road.name ?? road.id}`;
      group.setPluginData(FIGMA_KEY_ROAD_ID, road.id);
      figma.currentPage.insertChild(0, group);
    }

    // Node markers sit above road groups (appended after).
    for (const node of state.nodes.values()) {
      figma.currentPage.appendChild(this.buildNodeMarker(node));
    }
  }

  private buildRoadVisuals(road: Road, state: Readonly<MapState>): SceneNode[] {
    const startNode = state.nodes.get(road.startNodeId);
    const endNode   = state.nodes.get(road.endNodeId);
    if (!startNode || !endNode) return [];

    const p0: Vector = { x: startNode.pos.x + road.endpoints[0].endpointDisplacement.x, y: startNode.pos.y + road.endpoints[0].endpointDisplacement.y };
    const p1: Vector = { x: p0.x + road.endpoints[0].bezierDisplacement.x, y: p0.y + road.endpoints[0].bezierDisplacement.y };
    const p3: Vector = { x: endNode.pos.x + road.endpoints[1].endpointDisplacement.x, y: endNode.pos.y + road.endpoints[1].endpointDisplacement.y };
    const p2: Vector = { x: p3.x + road.endpoints[1].bezierDisplacement.x, y: p3.y + road.endpoints[1].bezierDisplacement.y };

    const sections = Array.from(road.sections.values()).sort((a, b) => a.index - b.index);
    const result: SceneNode[] = [];

    if (sections.length === 0) {
      const node = this.makeVectorCurve(bezierPathData({ p0, p1, p2, p3 }), SECTION_COLOR, ROAD_MIN_WIDTH);
      node.name = 'centerline';
      node.setPluginData(FIGMA_KEY_ROAD_ID, road.id);
      result.push(node);
    } else {
      const center = (sections.length - 1) / 2;
      for (const section of sections) {
        const offset = (section.index - center) * TRACK_SPACING;
        const o = offsetBezier({ p0, p1, p2, p3 }, offset);
        const numLines = getLinesForSection(section, state).length;
        const bandWidth = sectionBandWidth(numLines);
        const node = this.makeVectorCurve(bezierPathData(o), SECTION_COLOR, bandWidth);
        node.name = `Section: ${section.name ?? section.index}`;
        node.setPluginData(FIGMA_KEY_ROAD_ID, road.id);
        result.push(node);
      }
    }

    return result;
  }

  private makeVectorCurve(pathData: string, color: RGB, weight: number): VectorNode {
    const node = figma.createVector();
    node.vectorPaths = [{ windingRule: 'NONZERO', data: pathData }];
    node.fills = [];
    node.strokes = [{ type: 'SOLID', color }];
    node.strokeWeight = weight;
    node.strokeCap = 'ROUND';
    return node;
  }

  private buildNodeMarker(node: Node): EllipseNode {
    const ellipse = figma.createEllipse();
    ellipse.resize(NODE_RADIUS * 2, NODE_RADIUS * 2);
    ellipse.x = node.pos.x - NODE_RADIUS;
    ellipse.y = node.pos.y - NODE_RADIUS;
    ellipse.fills   = [{ type: 'SOLID', color: NODE_FILL }];
    ellipse.strokes = [{ type: 'SOLID', color: NODE_STROKE }];
    ellipse.strokeWeight = 1.5;
    ellipse.name = `Node: ${node.name ?? node.id}`;
    ellipse.setPluginData(FIGMA_KEY_NODE_ID, node.id);
    return ellipse;
  }

  private async clearPrevious(): Promise<void> {
    // Remove legacy outer group (from old renders that used a single container).
    figma.currentPage.findAll(n => n.name === ROAD_NETWORK_GROUP_NAME).forEach(n => {
      if (!n.removed) n.remove();
    });

    // Remove road groups and node markers that were placed directly on the page.
    // Road control vectors (isRoadControl='true') are managed by NetworkController, leave them alone.
    const toRemove = figma.currentPage.children.filter(n =>
      (n.getPluginData(FIGMA_KEY_NODE_ID) !== '') ||
      (n.getPluginData(FIGMA_KEY_ROAD_ID) !== '' && n.getPluginData(FIGMA_KEY_IS_ROAD_CONTROL) !== 'true')
    );
    for (const n of toRemove) {
      if (!n.removed) n.remove();
    }
  }
}
