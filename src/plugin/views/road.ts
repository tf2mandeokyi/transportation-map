import { MapState, Node, Road } from "../models/structures";
import { Model } from "../models";
import { offsetBezierAdaptive, bezierListPathData, TRACK_SPACING, ROAD_MIN_WIDTH } from "../utils/bezier";
import { getLinesForSection, sectionBandWidth } from "../utils/section";

export const NODE_RADIUS = 4;
export const FIGMA_KEY_NODE_ID      = 'mapNodeId';
export const FIGMA_KEY_ROAD_ID      = 'mapRoadId';
export const FIGMA_KEY_IS_ROAD_CONTROL = 'isRoadControl';

// Legacy group name kept so old renders from previous sessions can be cleaned up.
const ROAD_NETWORK_GROUP_NAME = '_road-network';

const SECTION_COLOR:  RGB = { r: 0.82, g: 0.82, b: 0.82 };
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
      const sectionNodes = this.buildRoadVisuals(road, state);
      if (sectionNodes.length === 0) continue;

      const group = figma.group(sectionNodes, figma.currentPage);
      group.name = `Road: ${road.name ?? road.id}`;
      group.setPluginData(FIGMA_KEY_ROAD_ID, road.id);
      figma.currentPage.insertChild(0, group);
    }

    // Junction polygons sit above road groups but below node markers.
    for (const node of state.nodes.values()) {
      const polygon = this.buildNodePolygon(node, state);
      if (polygon) figma.currentPage.appendChild(polygon);
    }

    // Node markers sit above everything.
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
      const pathData = bezierListPathData([{ p0, p1, p2, p3 }]);
      const node = this.makeVectorCurve(pathData, SECTION_COLOR, ROAD_MIN_WIDTH);
      node.name = 'centerline';
      node.setPluginData(FIGMA_KEY_ROAD_ID, road.id);
      result.push(node);
    } else {
      const center = (sections.length - 1) / 2;
      for (const section of sections) {
        const offset = (section.index - center) * TRACK_SPACING;
        const segments = offsetBezierAdaptive({ p0, p1, p2, p3 }, offset);
        const numLines = getLinesForSection(section, state).length;
        const bandWidth = sectionBandWidth(numLines);
        const node = this.makeVectorCurve(bezierListPathData(segments), SECTION_COLOR, bandWidth);
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

  private buildNodePolygon(node: Node, state: Readonly<MapState>): VectorNode | null {
    if (node.roadConnections.length < 2) return null;

    interface Arm {
      direction: Vector;
      n: Vector;        // perp(direction) — the CW-side perpendicular in screen (Y-down) coords
      posEdge: Vector;  // endpoint displaced to the +n (CW) side
      negEdge: Vector;  // endpoint displaced to the -n (CCW) side
    }

    const arms: Arm[] = [];

    for (const { roadId, endpointIndex } of node.roadConnections) {
      const road = state.roads.get(roadId);
      if (!road) continue;

      const conn = road.endpoints[endpointIndex];
      const ep: Vector = {
        x: node.pos.x + conn.endpointDisplacement.x,
        y: node.pos.y + conn.endpointDisplacement.y,
      };

      // Unit vector pointing INTO the road from this endpoint
      const bLen = Math.hypot(conn.bezierDisplacement.x, conn.bezierDisplacement.y);
      const dir: Vector = bLen < 0.001
        ? { x: 1, y: 0 }
        : { x: conn.bezierDisplacement.x / bLen, y: conn.bezierDisplacement.y / bLen };

      // perp(dir) rotates 90° CW in screen coords (Y-down), giving the CW-side perpendicular
      const n: Vector = { x: -dir.y, y: dir.x };

      // Compute outer edge offsets along n for the full road band at this endpoint
      const sections = Array.from(road.sections.values()).sort((a, b) => a.index - b.index);
      let posOff: number;
      let negOff: number;

      if (sections.length === 0) {
        posOff =  ROAD_MIN_WIDTH / 2;
        negOff = -ROAD_MIN_WIDTH / 2;
      } else {
        const center = (sections.length - 1) / 2;
        posOff = -Infinity;
        negOff =  Infinity;
        for (const sec of sections) {
          const sc = (sec.index - center) * TRACK_SPACING;
          const numLines = getLinesForSection(sec, state).length;
          const hb = sectionBandWidth(numLines) / 2;
          if (sc + hb > posOff) posOff = sc + hb;
          if (sc - hb < negOff) negOff = sc - hb;
        }
      }

      arms.push({
        direction: dir,
        n,
        posEdge: { x: ep.x + n.x * posOff, y: ep.y + n.y * posOff },
        negEdge: { x: ep.x + n.x * negOff, y: ep.y + n.y * negOff },
      });
    }

    if (arms.length < 2) return null;

    // Sort arms CW in screen coords: ascending atan2(direction.y, direction.x)
    arms.sort((a, b) =>
      Math.atan2(a.direction.y, a.direction.x) - Math.atan2(b.direction.y, b.direction.x),
    );

    // Build closed path.
    // For each arm: straight line across its road face (negEdge → posEdge),
    // then a cubic bezier to the next arm's negEdge.
    // At posEdge the outgoing tangent = n (along the road edge), giving C1 continuity
    // with the next gap curve; at negEdge the incoming tangent also = n of that arm.
    let path = `M ${arms[0].negEdge.x} ${arms[0].negEdge.y}`;

    for (let i = 0; i < arms.length; i++) {
      const curr = arms[i];
      const next = arms[(i + 1) % arms.length];

      // Road face: negEdge → posEdge (direction n, the CW-side perp)
      path += ` L ${curr.posEdge.x} ${curr.posEdge.y}`;

      // Gap geometry (A = apex, B = near edge, C = point on far ray):
      // Both inward rays (dA from posEdge, dB from negEdge) are fired toward the junction.
      // t, s = ray distances to apex A.  tNear = min(t,s).
      // C is placed on the far ray at distance tNear from A  →  AC = AB = tNear (isosceles △ABC).
      // Far side: straight line from its edge to C.
      // Near side: bezier from C to its edge (maximises bezier length).
      // The bezier departs C tangent to the straight line for C1 continuity at C.
      const dAx = -curr.direction.x, dAy = -curr.direction.y;
      const dBx = -next.direction.x, dBy = -next.direction.y;
      const gx  = next.negEdge.x - curr.posEdge.x;
      const gy  = next.negEdge.y - curr.posEdge.y;
      const det = dBx * dAy - dAx * dBy;

      let gapDone = false;
      if (Math.abs(det) > 1e-6) {
        const t = (dBx * gy - gx * dBy) / det;
        const s = (dAx * gy - dAy * gx) / det;
        if (t >= -1e-6 && s >= -1e-6) {
          const tNear = Math.min(t, s);
          if (t >= s) {
            // curr is far: straight posEdge→C, bezier C→negEdge (B)
            const cx = curr.posEdge.x + (t - tNear) * dAx;
            const cy = curr.posEdge.y + (t - tNear) * dAy;
            const a  = Math.hypot(next.negEdge.x - cx, next.negEdge.y - cy) * 0.4;
            path += ` L ${cx} ${cy}`;
            // cp1: depart C along dA (tangent to straight line)
            // cp2: handle toward node at negEdge (dB direction)
            path += ` C ${cx + dAx * a} ${cy + dAy * a} ${next.negEdge.x + dBx * a} ${next.negEdge.y + dBy * a} ${next.negEdge.x} ${next.negEdge.y}`;
          } else {
            // next is far: bezier posEdge→C, straight C→negEdge (B)
            const cx = next.negEdge.x + (s - tNear) * dBx;
            const cy = next.negEdge.y + (s - tNear) * dBy;
            const a  = Math.hypot(curr.posEdge.x - cx, curr.posEdge.y - cy) * 0.4;
            // cp1: handle toward node at posEdge (dA direction)
            // cp2: arrive at C along dB (tangent to outgoing straight line)
            path += ` C ${curr.posEdge.x + dAx * a} ${curr.posEdge.y + dAy * a} ${cx + dBx * a} ${cy + dBy * a} ${cx} ${cy}`;
            path += ` L ${next.negEdge.x} ${next.negEdge.y}`;
          }
          gapDone = true;
        }
      }
      if (!gapDone) path += ` L ${next.negEdge.x} ${next.negEdge.y}`;
    }

    path += ' Z';

    const vn = figma.createVector();
    vn.vectorPaths = [{ windingRule: 'NONZERO', data: path }];
    vn.fills = [{ type: 'SOLID', color: JUNCTION_FILL }];
    vn.strokes = [];
    vn.locked = true;
    vn.name = `Junction: ${node.name ?? node.id}`;
    vn.setPluginData(FIGMA_KEY_NODE_ID, node.id);
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

    // Push junction polygons (vectors tagged with a node ID).
    for (const child of children) {
      if (!child.removed && child.type === 'VECTOR' && child.getPluginData(FIGMA_KEY_NODE_ID) !== '') {
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
