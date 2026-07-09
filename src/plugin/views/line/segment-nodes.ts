// Draws every jump as its own "M from L to" subpath in a single node — Figma's
// dashPattern is per-node, so all dashed jumps for a line share one node
// (and stay separate from the solid subpaths, which need no dashing).
export function createDashedLine(jumps: Array<{ from: Vector; to: Vector }>, color: RGB): VectorNode {
  const path = jumps.map(({ from, to }) => `M ${from.x} ${from.y} L ${to.x} ${to.y}`).join(' ');
  const node = figma.createVector();
  node.vectorPaths = [{ windingRule: 'NONZERO', data: path }];
  node.strokes = [{ type: 'SOLID', color }];
  node.strokeWeight = 2;
  node.strokeCap = 'ROUND';
  node.dashPattern = [4, 5];
  return node;
}

export function bezierPathToSegments(pathData: string, color: RGB): { outline: VectorNode; main: VectorNode } {
  const outlineNode = figma.createVector();
  outlineNode.vectorPaths = [{ windingRule: 'NONZERO', data: pathData }];
  outlineNode.strokes = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
  outlineNode.strokeWeight = 4;
  outlineNode.strokeCap = 'ROUND';
  outlineNode.strokeJoin = 'ROUND';

  const mainNode = figma.createVector();
  mainNode.vectorPaths = [{ windingRule: 'NONZERO', data: pathData }];
  mainNode.strokes = [{ type: 'SOLID', color }];
  mainNode.strokeWeight = 2;
  mainNode.strokeCap = 'ROUND';
  mainNode.strokeJoin = 'ROUND';

  return { outline: outlineNode, main: mainNode };
}
