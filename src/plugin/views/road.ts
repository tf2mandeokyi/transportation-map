import { MapState, Node, Road } from "../models/structures";
import { Model } from "../models";
import { offsetBezierAdaptive, bezierListPathData, TRACK_SPACING, ROAD_MIN_WIDTH } from "../utils/bezier";
import { JunctionShape } from "../utils/junction-shape";
import { PathBuilder } from "../utils/path";
import { getLinesForSection, sectionBandWidth } from "../utils/section";

export const NODE_RADIUS = 4;
export const FIGMA_KEY_NODE_ID           = 'mapNodeId';
export const FIGMA_KEY_ROAD_ID           = 'mapRoadId';
export const FIGMA_KEY_IS_ROAD_CONTROL   = 'isRoadControl';
export const FIGMA_KEY_JUNCTION_OFFSET_X = 'junctionOffsetX';
export const FIGMA_KEY_JUNCTION_OFFSET_Y = 'junctionOffsetY';

// Legacy group name kept so old renders from previous sessions can be cleaned up.
const ROAD_NETWORK_GROUP_NAME = '_road-network';

const SECTION_COLOR:  RGB = { r: 0.82, g: 0.82, b: 0.82 };
const DIVIDER_COLOR:  RGB = { r: 0.65, g: 0.65, b: 0.65 };
const DIVIDER_WIDTH = 1.5;
const JUNCTION_FILL:  RGB = { r: 0.82, g: 0.82, b: 0.82 };
const NODE_FILL:   RGB = { r: 0.2, g: 0.2, b: 0.2 };
const NODE_STROKE: RGB = { r: 1, g: 1, b: 1 };

export class RoadRenderer {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public setModel(_model: Model): void {}

  public async renderAll(state: Readonly<MapState>): Promise<void> {
    await this.clearPrevious();

    // Road groups go to the bottom of the page (inserted at index 0).
    for (const road of state.roads.values()) {
      const nodes = this.buildRoadVisuals(road, state);
      if (nodes.length === 0) continue;

      // When a road has sections, wrap band + dividers in a nested 'sections' group.
      let children: SceneNode[];
      if (nodes.length > 1) {
        const inner = figma.group(nodes, figma.currentPage);
        inner.name = 'sections';
        children = [inner];
      } else {
        children = nodes;
      }

      const group = figma.group(children, figma.currentPage);
      group.name = `Road: ${road.name ?? road.id}`;
      group.setPluginData(FIGMA_KEY_ROAD_ID, road.id);
      figma.currentPage.insertChild(0, group);
    }

    // Junction polygons: each wrapped in a frame so the container is clickable while the inner shape stays locked.
    const nodesWithJunction = new Set<string>();
    for (const node of state.nodes.values()) {
      const polygon = this.buildNodePolygon(node, state);
      if (!polygon) continue;
      nodesWithJunction.add(node.id);

      // Temporarily place on page to read visual bounds, then reparent into the frame.
      figma.currentPage.appendChild(polygon);
      const bounds = polygon.absoluteBoundingBox!;

      const frame = figma.createFrame();
      frame.x = bounds.x;
      frame.y = bounds.y;
      frame.resize(Math.max(bounds.width, 1), Math.max(bounds.height, 1));
      frame.fills = [];
      frame.clipsContent = false;
      frame.name = `Junction: ${node.name ?? node.id}`;
      frame.setPluginData(FIGMA_KEY_NODE_ID, node.id);
      frame.setPluginData(FIGMA_KEY_JUNCTION_OFFSET_X, String(node.pos.x - bounds.x));
      frame.setPluginData(FIGMA_KEY_JUNCTION_OFFSET_Y, String(node.pos.y - bounds.y));
      figma.currentPage.appendChild(frame);
      frame.appendChild(polygon);
      // The path data uses absolute page coords. After reparenting, subtract the
      // frame's position so the coords are correct in frame-local space.
      polygon.x = 0;
      polygon.y = 0;
    }

    // Node markers only for nodes that have no junction polygon.
    for (const node of state.nodes.values()) {
      if (nodesWithJunction.has(node.id)) continue;
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
      const pathData = bezierListPathData([{ p0, p1, p2, p3 }]);
      const node = this.makeVectorCurve(pathData, SECTION_COLOR, ROAD_MIN_WIDTH);
      node.name = 'centerline';
      node.setPluginData(FIGMA_KEY_ROAD_ID, road.id);
      result.push(node);
      return result;
    }

    const center = (sections.length - 1) / 2;
    const baseCurve = { p0, p1, p2, p3 };

    const leftSection  = sections[0];
    const rightSection = sections[sections.length - 1];
    const leftOffset   = (leftSection.index  - center) * TRACK_SPACING;
    const rightOffset  = (rightSection.index - center) * TRACK_SPACING;
    const leftEdge     = leftOffset  - sectionBandWidth(getLinesForSection(leftSection,  state).length) / 2;
    const rightEdge    = rightOffset + sectionBandWidth(getLinesForSection(rightSection, state).length) / 2;
    const totalWidth   = rightEdge - leftEdge;
    const bandCenterOffset = (leftEdge + rightEdge) / 2;

    // Single road bezier covering all sections.
    const roadSegments = offsetBezierAdaptive(baseCurve, bandCenterOffset);
    const roadNode = this.makeVectorCurve(bezierListPathData(roadSegments), SECTION_COLOR, totalWidth);
    roadNode.name = 'band';
    roadNode.setPluginData(FIGMA_KEY_ROAD_ID, road.id);
    result.push(roadNode);

    // Thin dividing curves between adjacent sections.
    for (let i = 0; i < sections.length - 1; i++) {
      const divOffset   = ((sections[i].index + sections[i + 1].index) / 2 - center) * TRACK_SPACING;
      const divSegments = offsetBezierAdaptive(baseCurve, divOffset);
      const divNode     = this.makeVectorCurve(bezierListPathData(divSegments), DIVIDER_COLOR, DIVIDER_WIDTH);
      divNode.name = `divider-${i}`;
      divNode.setPluginData(FIGMA_KEY_ROAD_ID, road.id);
      result.push(divNode);
    }

    return result;
  }

  private makeVectorCurve(pathData: string, color: RGB, weight: number): VectorNode {
    const node = figma.createVector();
    node.vectorPaths = [{ windingRule: 'NONZERO', data: pathData }];
    node.fills = [];
    node.strokes = [{ type: 'SOLID', color }];
    node.strokeWeight = weight;
    node.strokeCap = 'NONE';
    return node;
  }

  private buildNodePolygon(node: Node, state: Readonly<MapState>): VectorNode | null {
    const shape = new JunctionShape(node, state);
    if (!shape.isValid) return null;

    const pb = new PathBuilder();
    shape.drawPolygon(pb);

    const vn = figma.createVector();
    vn.vectorPaths = [{ windingRule: 'NONZERO', data: pb.build() }];
    vn.fills = [{ type: 'SOLID', color: JUNCTION_FILL }];
    vn.strokes = [];
    vn.locked = true;
    vn.name = 'polygon';
    return vn;
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

  // Pushes all road infrastructure (roads, junctions, node markers) to the back
  // of the page z-order so lines and stations appear on top.
  // Call after moveSegmentsToBack so the final stacking is:
  //   roads < junctions < node markers < line segments < stations
  public moveAllToBack(): void {
    const children = [...figma.currentPage.children];

    // Push node markers (ellipses) first — they'll end up above junctions after junctions are pushed.
    for (const child of children) {
      if (!child.removed && child.type === 'ELLIPSE' && child.getPluginData(FIGMA_KEY_NODE_ID) !== '') {
        figma.currentPage.insertChild(0, child);
      }
    }

    // Push junction frames (frames tagged with a node ID).
    for (const child of children) {
      if (!child.removed && child.type === 'FRAME' && child.getPluginData(FIGMA_KEY_NODE_ID) !== '') {
        figma.currentPage.insertChild(0, child);
      }
    }

    // Push road groups (tagged with a road ID, excluding interactive control vectors).
    for (const child of children) {
      if (
        !child.removed &&
        child.getPluginData(FIGMA_KEY_ROAD_ID) !== '' &&
        child.getPluginData(FIGMA_KEY_IS_ROAD_CONTROL) !== 'true'
      ) {
        figma.currentPage.insertChild(0, child);
      }
    }
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
