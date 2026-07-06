export function distSq(a: Vector, b: Vector): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

export function lerp(a: Vector, b: Vector, t: number): Vector {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function normalize(v: Vector): Vector {
  const len = Math.hypot(v.x, v.y);
  return len < 0.001 ? { x: 1, y: 0 } : { x: v.x / len, y: v.y / len };
}

export function perp(v: Vector): Vector {
  return { x: -v.y, y: v.x };
}

export function dot(a: Vector, b: Vector): number {
  return a.x * b.x + a.y * b.y;
}

export function applyLateralOffset(pos: Vector, tan: Vector, offset: number): Vector {
  const len = Math.hypot(tan.x, tan.y) || 1;
  return { x: pos.x + (-tan.y / len) * offset, y: pos.y + (tan.x / len) * offset };
}

export function applyTransform(transform: Transform, point: Vector): Vector {
  return {
    x: transform[0][0] * point.x + transform[0][1] * point.y + transform[0][2],
    y: transform[1][0] * point.x + transform[1][1] * point.y + transform[1][2],
  };
}

// node.x/node.y are parent-relative and go stale the instant Figma reparents a
// dragged node into a frame it was dropped onto. absoluteTransform's translation
// column is the page-space origin regardless of parent, so use this instead of
// node.x/node.y whenever reading back a position after a possible user drag.
export function absoluteOrigin(node: SceneNode): Vector {
  return { x: node.absoluteTransform[0][2], y: node.absoluteTransform[1][2] };
}
