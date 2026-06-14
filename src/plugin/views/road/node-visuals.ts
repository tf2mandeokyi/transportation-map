import { MapState, Node } from "../../models/structures";
import { JunctionShape } from "../../utils/junction-shape";
import { PathBuilder } from "../../utils/path";
import { NODE_RADIUS, FIGMA_KEY_NODE_ID, FIGMA_KEY_JUNCTION_OFFSET_X, FIGMA_KEY_JUNCTION_OFFSET_Y } from "./constants";

const JUNCTION_FILL: RGB = { r: 0.82, g: 0.82, b: 0.82 };
const NODE_FILL:     RGB = { r: 0.2,  g: 0.2,  b: 0.2  };
const NODE_STROKE:   RGB = { r: 1,    g: 1,     b: 1    };

export function buildNodePolygon(node: Node, state: Readonly<MapState>): VectorNode | null {
  const shape = new JunctionShape(node, state);
  if (!shape.isValid) return null;

  const pb = new PathBuilder();
  shape.drawPolygon(pb);

  const vn = figma.createVector();
  vn.vectorPaths = [{ windingRule: 'NONZERO', data: pb.build() }];
  vn.fills  = [{ type: 'SOLID', color: JUNCTION_FILL }];
  vn.strokes = [];
  vn.locked = true;
  vn.name   = 'polygon';
  return vn;
}

function computeJunctionCenter(node: Node, bounds: Rect, state: Readonly<MapState>): Vector {
  let jx = 0, jy = 0, jc = 0;
  for (const { roadId, endpointIndex } of node.roadConnections) {
    const road = state.roads.get(roadId);
    if (!road) continue;
    jx += road.endpoints[endpointIndex].endpointPos.x;
    jy += road.endpoints[endpointIndex].endpointPos.y;
    jc++;
  }
  return jc > 0 ? { x: jx / jc, y: jy / jc } : { x: bounds.x, y: bounds.y };
}

// Returns true if a junction frame was appended (so the caller can skip the node marker).
export async function buildAndAppendJunction(node: Node, state: Readonly<MapState>): Promise<boolean> {
  const polygon = buildNodePolygon(node, state);
  if (!polygon) return false;

  // Temporarily place on page to read absolute bounds, then reparent into a frame.
  figma.currentPage.appendChild(polygon);
  const bounds = polygon.absoluteBoundingBox;
  if (!bounds) { polygon.remove(); return false; }

  const frame = figma.createFrame();
  frame.x = bounds.x;
  frame.y = bounds.y;
  frame.resize(Math.max(bounds.width, 1), Math.max(bounds.height, 1));
  frame.fills = [];
  frame.clipsContent = false;
  frame.name = `Junction: ${node.name ?? node.id}`;
  frame.setPluginData(FIGMA_KEY_NODE_ID, node.id);

  const center = computeJunctionCenter(node, bounds, state);
  frame.setPluginData(FIGMA_KEY_JUNCTION_OFFSET_X, String(center.x - bounds.x));
  frame.setPluginData(FIGMA_KEY_JUNCTION_OFFSET_Y, String(center.y - bounds.y));

  figma.currentPage.appendChild(frame);
  frame.appendChild(polygon);
  // The path data uses absolute page coords; after reparenting reset to frame-local origin.
  polygon.x = 0;
  polygon.y = 0;
  return true;
}

function resolveNodePosition(node: Node, state: Readonly<MapState>): Vector | null {
  let x = 0, y = 0, count = 0;
  for (const { roadId, endpointIndex } of node.roadConnections) {
    const road = state.roads.get(roadId);
    if (!road) continue;
    x += road.endpoints[endpointIndex].endpointPos.x;
    y += road.endpoints[endpointIndex].endpointPos.y;
    count++;
  }
  if (count > 0) return { x: x / count, y: y / count };
  if (!node.isolatedPos) {
    console.warn(`[buildNodeMarker] isolated node ${node.id} has no isolatedPos — skipping`);
    return null;
  }
  console.log(`[buildNodeMarker] isolated node ${node.id} at isolatedPos`, node.isolatedPos);
  return node.isolatedPos;
}

export function buildNodeMarker(node: Node, state: Readonly<MapState>): EllipseNode | null {
  const pos = resolveNodePosition(node, state);
  if (!pos) return null;

  const ellipse = figma.createEllipse();
  ellipse.resize(NODE_RADIUS * 2, NODE_RADIUS * 2);
  ellipse.x = pos.x - NODE_RADIUS;
  ellipse.y = pos.y - NODE_RADIUS;
  ellipse.fills   = [{ type: 'SOLID', color: NODE_FILL   }];
  ellipse.strokes = [{ type: 'SOLID', color: NODE_STROKE }];
  ellipse.strokeWeight = 1.5;
  ellipse.name = `Node: ${node.name ?? node.id}`;
  ellipse.setPluginData(FIGMA_KEY_NODE_ID, node.id);
  return ellipse;
}
