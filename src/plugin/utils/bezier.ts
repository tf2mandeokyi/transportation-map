import { PathBuilder } from './path';

export const LINE_SPACING = 6;
export const ROAD_MARGIN = 1;
export const ROAD_MIN_WIDTH = 8;

// Quadratic bezier — stored in Road.bezierMidPoint.
// p1 is the single control point; the curve passes through p0 and p2.
export interface QuadBezierPoints {
  p0: Vector;
  p1: Vector;
  p2: Vector;
}

// Cubic bezier — used for offset computation and SVG path output.
// A quadratic can be losslessly elevated to cubic via elevateToCubic().
export interface CubicBezierPoints {
  p0: Vector;
  p1: Vector;
  p2: Vector;
  p3: Vector;
}

// ── Quadratic evaluation ──────────────────────────────────────────────────────

export function evalQuadraticBezier({ p0, p1, p2 }: QuadBezierPoints, t: number): Vector {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  };
}

export function evalQuadraticBezierTangent({ p0, p1, p2 }: QuadBezierPoints, t: number): Vector {
  const u = 1 - t;
  return {
    x: 2 * (u * (p1.x - p0.x) + t * (p2.x - p1.x)),
    y: 2 * (u * (p1.y - p0.y) + t * (p2.y - p1.y)),
  };
}

function lerp(a: Vector, b: Vector, t: number): Vector {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function splitQuad({ p0, p1, p2 }: QuadBezierPoints, t: number) {
  const p01  = lerp(p0, p1, t);
  const p12  = lerp(p1, p2, t);
  const p012 = lerp(p01, p12, t);
  return {
    left:  { p0, p1: p01,  p2: p012 },
    right: { p0: p012, p1: p12, p2 },
  };
}

function subQuadForward(points: QuadBezierPoints, t1: number, t2: number): QuadBezierPoints {
  const { left } = splitQuad(points, t2);
  const t1r = t2 > 0.0001 ? t1 / t2 : 0;
  const { right } = splitQuad(left, t1r);
  return right;
}

export function subQuadBezier(points: QuadBezierPoints, t1: number, t2: number): QuadBezierPoints {
  if (t1 > t2) {
    const s = subQuadForward(points, t2, t1);
    return { p0: s.p2, p1: s.p1, p2: s.p0 };
  }
  return subQuadForward(points, t1, t2);
}

// ── Degree elevation ──────────────────────────────────────────────────────────

// Exact, lossless conversion: the resulting cubic traces the identical curve.
export function elevateToCubic({ p0, p1, p2 }: QuadBezierPoints): CubicBezierPoints {
  return {
    p0,
    p1: { x: p0.x / 3 + 2 * p1.x / 3, y: p0.y / 3 + 2 * p1.y / 3 },
    p2: { x: 2 * p1.x / 3 + p2.x / 3, y: 2 * p1.y / 3 + p2.y / 3 },
    p3: p2,
  };
}

// ── Cubic evaluation ──────────────────────────────────────────────────────────

export function evalCubicBezier({ p0, p1, p2, p3 }: CubicBezierPoints, t: number): Vector {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}

export function evalCubicBezierTangent({ p0, p1, p2, p3 }: CubicBezierPoints, t: number): Vector {
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

export function offsetBezier({ p0, p1, p2, p3 }: CubicBezierPoints, offset: number): CubicBezierPoints {
  const n0 = perp(normalize({ x: p1.x - p0.x, y: p1.y - p0.y }));
  const n3 = perp(normalize({ x: p3.x - p2.x, y: p3.y - p2.y }));
  return {
    p0: { x: p0.x + n0.x * offset, y: p0.y + n0.y * offset },
    p1: { x: p1.x + n0.x * offset, y: p1.y + n0.y * offset },
    p2: { x: p2.x + n3.x * offset, y: p2.y + n3.y * offset },
    p3: { x: p3.x + n3.x * offset, y: p3.y + n3.y * offset },
  };
}

function offsetApproxError(original: CubicBezierPoints, approx: CubicBezierPoints, offset: number): number {
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

function splitCubic({ p0, p1, p2, p3 }: CubicBezierPoints, t: number) {
  const p01   = lerp(p0, p1, t);
  const p12   = lerp(p1, p2, t);
  const p23   = lerp(p2, p3, t);
  const p012  = lerp(p01, p12, t);
  const p123  = lerp(p12, p23, t);
  const p0123 = lerp(p012, p123, t);
  return {
    left:  { p0, p1: p01,   p2: p012,  p3: p0123 },
    right: { p0: p0123, p1: p123, p2: p23,  p3 },
  };
}

function offsetRecurse(
  points: CubicBezierPoints, offset: number, tolerance: number,
  result: CubicBezierPoints[], depth: number,
): void {
  const approx = offsetBezier(points, offset);
  if (depth >= 8 || offsetApproxError(points, approx, offset) <= tolerance) {
    result.push(approx);
    return;
  }
  const { left, right } = splitCubic(points, 0.5);
  offsetRecurse(left,  offset, tolerance, result, depth + 1);
  offsetRecurse(right, offset, tolerance, result, depth + 1);
}

export function offsetBezierAdaptive(points: CubicBezierPoints, offset: number, tolerance = 0.5): CubicBezierPoints[] {
  if (offset === 0) return [points];
  const result: CubicBezierPoints[] = [];
  offsetRecurse(points, offset, tolerance, result, 0);
  return result;
}

function subCubicForward(points: CubicBezierPoints, t1: number, t2: number): CubicBezierPoints {
  const { left } = splitCubic(points, t2);
  const t1r = t2 > 0.0001 ? t1 / t2 : 0;
  const { right } = splitCubic(left, t1r);
  return right;
}

export function subCubicBezier(points: CubicBezierPoints, t1: number, t2: number): CubicBezierPoints {
  if (t1 > t2) {
    const s = subCubicForward(points, t2, t1);
    return { p0: s.p3, p1: s.p2, p2: s.p1, p3: s.p0 };
  }
  return subCubicForward(points, t1, t2);
}

export function bezierListPathData(beziers: CubicBezierPoints[]): string {
  return new PathBuilder().beziers(beziers).build();
}

export function bezierPathData(seg: CubicBezierPoints): string {
  return new PathBuilder().beziers([seg]).build();
}
