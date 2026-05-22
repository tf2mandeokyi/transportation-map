export const TRACK_SPACING = 8;
export const LINE_SPACING = 6;   // center-to-center distance between parallel lines in a section
export const ROAD_MARGIN = 4;    // margin from outermost line center to road band edge
export const ROAD_MIN_WIDTH = 8; // minimum road band width when no lines are present

export interface BezierPoints {
  p0: Vector;
  p1: Vector;
  p2: Vector;
  p3: Vector;
}

export function evalCubicBezier({ p0, p1, p2, p3 }: BezierPoints, t: number): Vector {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}

export function evalCubicBezierTangent({ p0, p1, p2, p3 }: BezierPoints, t: number): Vector {
  const u = 1 - t;
  return {
    x: 3 * (u * u * (p1.x - p0.x) + 2 * u * t * (p2.x - p1.x) + t * t * (p3.x - p2.x)),
    y: 3 * (u * u * (p1.y - p0.y) + 2 * u * t * (p2.y - p1.y) + t * t * (p3.y - p2.y)),
  };
}

function normalize(v: Vector): Vector {
  const len = Math.hypot(v.x, v.y);
  return len < 0.001 ? { x: 1, y: 0 } : { x: v.x / len, y: v.y / len };
}

function perp(v: Vector): Vector {
  return { x: -v.y, y: v.x };
}

export function offsetBezier({ p0, p1, p2, p3 }: BezierPoints, offset: number): BezierPoints {
  const n0 = perp(normalize({ x: p1.x - p0.x, y: p1.y - p0.y }));
  const n3 = perp(normalize({ x: p3.x - p2.x, y: p3.y - p2.y }));
  return {
    p0: { x: p0.x + n0.x * offset, y: p0.y + n0.y * offset },
    p1: { x: p1.x + n0.x * offset, y: p1.y + n0.y * offset },
    p2: { x: p2.x + n3.x * offset, y: p2.y + n3.y * offset },
    p3: { x: p3.x + n3.x * offset, y: p3.y + n3.y * offset },
  };
}

// Maximum positional error between the simple-offset approximation and the true offset
// at t ∈ {0.25, 0.5, 0.75}.  "True offset" = evaluate original curve, then move by
// offset along the perpendicular normal at that point.
function offsetApproxError(original: BezierPoints, approx: BezierPoints, offset: number): number {
  let maxErr = 0;
  for (const t of [0.25, 0.5, 0.75]) {
    const pos = evalCubicBezier(original, t);
    const n   = perp(normalize(evalCubicBezierTangent(original, t)));
    const trueX = pos.x + n.x * offset;
    const trueY = pos.y + n.y * offset;
    const app = evalCubicBezier(approx, t);
    const err = Math.hypot(trueX - app.x, trueY - app.y);
    if (err > maxErr) maxErr = err;
  }
  return maxErr;
}

function offsetRecurse(
  points: BezierPoints, offset: number, tolerance: number,
  result: BezierPoints[], depth: number,
): void {
  const approx = offsetBezier(points, offset);
  if (depth >= 8 || offsetApproxError(points, approx, offset) <= tolerance) {
    result.push(approx);
    return;
  }
  const { left, right } = splitBezier(points, 0.5);
  offsetRecurse(left,  offset, tolerance, result, depth + 1);
  offsetRecurse(right, offset, tolerance, result, depth + 1);
}

// Adaptive parallel-curve approximation: subdivides until the simple Tiller-Hanson
// offset is within `tolerance` pixels of the true offset at three interior sample points.
export function offsetBezierAdaptive(points: BezierPoints, offset: number, tolerance = 0.5): BezierPoints[] {
  if (offset === 0) return [points];
  const result: BezierPoints[] = [];
  offsetRecurse(points, offset, tolerance, result, 0);
  return result;
}

// Converts a list of (possibly split) bezier segments into a single SVG path string.
// Consecutive segments are assumed to be end-to-end (no gap), so only the first uses M.
export function bezierListPathData(beziers: BezierPoints[]): string {
  if (beziers.length === 0) return '';
  const f = beziers[0];
  let path = `M ${f.p0.x} ${f.p0.y} C ${f.p1.x} ${f.p1.y} ${f.p2.x} ${f.p2.y} ${f.p3.x} ${f.p3.y}`;
  for (let i = 1; i < beziers.length; i++) {
    const { p1, p2, p3 } = beziers[i];
    path += ` C ${p1.x} ${p1.y} ${p2.x} ${p2.y} ${p3.x} ${p3.y}`;
  }
  return path;
}

function lerp(a: Vector, b: Vector, t: number): Vector {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function splitBezier({ p0, p1, p2, p3 }: BezierPoints, t: number) {
  const p01 = lerp(p0, p1, t);
  const p12 = lerp(p1, p2, t);
  const p23 = lerp(p2, p3, t);
  const p012 = lerp(p01, p12, t);
  const p123 = lerp(p12, p23, t);
  const p0123 = lerp(p012, p123, t);
  return {
    left:  { p0, p1: p01,   p2: p012,  p3: p0123 },
    right: { p0: p0123, p1: p123, p2: p23,  p3 },
  };
}

function subBezierForward(points: BezierPoints, t1: number, t2: number): BezierPoints {
  const { left } = splitBezier(points, t2);
  const t1r = t2 > 0.0001 ? t1 / t2 : 0;
  const { right } = splitBezier(left, t1r);
  return right;
}

export function subBezier(points: BezierPoints, t1: number, t2: number): BezierPoints {
  if (t1 > t2) {
    const s = subBezierForward(points, t2, t1);
    return { p0: s.p3, p1: s.p2, p2: s.p1, p3: s.p0 };
  }
  return subBezierForward(points, t1, t2);
}

export function bezierPathData({ p0, p1, p2, p3 }: BezierPoints): string {
  return `M ${p0.x} ${p0.y} C ${p1.x} ${p1.y} ${p2.x} ${p2.y} ${p3.x} ${p3.y}`;
}
