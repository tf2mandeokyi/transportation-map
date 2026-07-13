import { Node } from "../../models/structures";
import { JunctionShape } from "../../utils/junction-shape";
import { PathBuilder } from "../../utils/path";
import { NODE_MARKER_RADIUS, FIGMA_KEY_NODE_ID, FIGMA_KEY_IS_NODE_MARKER, FIGMA_KEY_JUNCTION_OFFSET_X, FIGMA_KEY_JUNCTION_OFFSET_Y } from "./constants";
import { renderEditHandle } from "../../figmls";

const JUNCTION_FILL: RGB = { r: 0.82, g: 0.82, b: 0.82 };

export function buildNodePolygon(node: Node): VectorNode | null {
  const shape = new JunctionShape(node);
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

function computeJunctionCenter(node: Node): Vector {
  return node.position;
}

// Returns true if a junction frame was appended (so the caller can skip the node marker).
export async function buildAndAppendJunction(node: Node, junctionsFrame: FrameNode): Promise<boolean> {
  const polygon = buildNodePolygon(node);
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

  const center = computeJunctionCenter(node);
  frame.setPluginData(FIGMA_KEY_JUNCTION_OFFSET_X, String(center.x - bounds.x));
  frame.setPluginData(FIGMA_KEY_JUNCTION_OFFSET_Y, String(center.y - bounds.y));

  // junctionsFrame sits at page origin (0,0) with no transform, so reparenting into it
  // needs no coordinate adjustment — frame.x/y stay valid as-is.
  junctionsFrame.appendChild(frame);
  frame.appendChild(polygon);
  // The path data uses absolute page coords; after reparenting reset to frame-local origin.
  polygon.x = 0;
  polygon.y = 0;
  return true;
}

export async function buildNodeMarker(node: Node): Promise<FrameNode | null> {
  const pos = node.position;

  const frame = await renderEditHandle({ fill: '#333333', size: NODE_MARKER_RADIUS * 2 }).intoNode() as FrameNode;
  frame.x = pos.x - NODE_MARKER_RADIUS;
  frame.y = pos.y - NODE_MARKER_RADIUS;
  frame.name = `Node: ${node.name ?? node.id}`;
  frame.setPluginData(FIGMA_KEY_NODE_ID, node.id);
  frame.setPluginData(FIGMA_KEY_IS_NODE_MARKER, 'true');
  return frame;
}
