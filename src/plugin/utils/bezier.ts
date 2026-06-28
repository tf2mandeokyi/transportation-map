import { PathBuilder } from './path';

function lerp(a: Vector, b: Vector, t: number): Vector {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function normalize(v: Vector): Vector {
  const len = Math.hypot(v.x, v.y);
  return len < 0.001 ? { x: 1, y: 0 } : { x: v.x / len, y: v.y / len };
}

function perp(v: Vector): Vector {
  return { x: -v.y, y: v.x };
}

abstract class BezierPoints<T extends BezierPoints<T>> {
  abstract eval(t: number): Vector;
  abstract evalTangent(t: number): Vector;
  abstract split(t: number): { left: T; right: T };
  abstract sub(t1: number, t2: number): T;

  subForward(t1: number, t2: number): T {
    const { left } = this.split(t2);
    const t1r = t2 > 0.0001 ? t1 / t2 : 0;
    const { right } = left.split(t1r);
    return right;
  }
}

// Quadratic bezier — stored in Road.bezierMidPoint.
// p1 is the single control point; the curve passes through p0 and p2.
export class QuadBezierPoints extends BezierPoints<QuadBezierPoints> {
  p0: Vector;
  p1: Vector;
  p2: Vector;

  constructor(p0: Vector, p1: Vector, p2: Vector) {
    super();
    this.p0 = p0;
    this.p1 = p1;
    this.p2 = p2;
  }

  eval(t: number): Vector {
    const u = 1 - t;
    return {
      x: u * u * this.p0.x + 2 * u * t * this.p1.x + t * t * this.p2.x,
      y: u * u * this.p0.y + 2 * u * t * this.p1.y + t * t * this.p2.y,
    };
  }

  evalTangent(t: number): Vector {
    const u = 1 - t;
    return {
      x: 2 * (u * (this.p1.x - this.p0.x) + t * (this.p2.x - this.p1.x)),
      y: 2 * (u * (this.p1.y - this.p0.y) + t * (this.p2.y - this.p1.y)),
    };
  }

  split(t: number): { left: QuadBezierPoints; right: QuadBezierPoints } {
    const p01  = lerp(this.p0, this.p1, t);
    const p12  = lerp(this.p1, this.p2, t);
    const p012 = lerp(p01, p12, t);
    return {
      left:  new QuadBezierPoints(this.p0, p01,  p012 ),
      right: new QuadBezierPoints(p012, p12, this.p2 ),
    };
  }

  sub(t1: number, t2: number): QuadBezierPoints {
    if (t1 > t2) {
      const s = this.subForward(t2, t1);
      return new QuadBezierPoints(s.p2, s.p1, s.p0);
    }
    return this.subForward(t1, t2);
  }

  // Exact, lossless conversion: the resulting cubic traces the identical curve.
  elevateToCubic(): CubicBezierPoints {
    return new CubicBezierPoints(
      this.p0,
      { x: this.p0.x / 3 + 2 * this.p1.x / 3, y: this.p0.y / 3 + 2 * this.p1.y / 3 },
      { x: 2 * this.p1.x / 3 + this.p2.x / 3, y: 2 * this.p1.y / 3 + this.p2.y / 3 },
      this.p2
    );
  }
}

// Cubic bezier — used for offset computation and SVG path output.
// A quadratic can be losslessly elevated to cubic via elevateToCubic().
export class CubicBezierPoints extends BezierPoints<CubicBezierPoints> {
  p0: Vector;
  p1: Vector;
  p2: Vector;
  p3: Vector;

  constructor(p0: Vector, p1: Vector, p2: Vector, p3: Vector) {
    super();
    this.p0 = p0;
    this.p1 = p1;
    this.p2 = p2;
    this.p3 = p3;
  }

  eval(t: number): Vector {
    const u = 1 - t;
    return {
      x: u * u * u * this.p0.x + 3 * u * u * t * this.p1.x + 3 * u * t * t * this.p2.x + t * t * t * this.p3.x,
      y: u * u * u * this.p0.y + 3 * u * u * t * this.p1.y + 3 * u * t * t * this.p2.y + t * t * t * this.p3.y,
    };
  }

  evalTangent(t: number): Vector {
    const u = 1 - t;
    return {
      x: 3 * (u * u * (this.p1.x - this.p0.x) + 2 * u * t * (this.p2.x - this.p1.x) + t * t * (this.p3.x - this.p2.x)),
      y: 3 * (u * u * (this.p1.y - this.p0.y) + 2 * u * t * (this.p2.y - this.p1.y) + t * t * (this.p3.y - this.p2.y)),
    };
  }

  offset(offset: number): CubicBezierPoints {
    const n0 = perp(normalize({ x: this.p1.x - this.p0.x, y: this.p1.y - this.p0.y }));
    const n3 = perp(normalize({ x: this.p3.x - this.p2.x, y: this.p3.y - this.p2.y }));
    return new CubicBezierPoints(
      { x: this.p0.x + n0.x * offset, y: this.p0.y + n0.y * offset },
      { x: this.p1.x + n0.x * offset, y: this.p1.y + n0.y * offset },
      { x: this.p2.x + n3.x * offset, y: this.p2.y + n3.y * offset },
      { x: this.p3.x + n3.x * offset, y: this.p3.y + n3.y * offset }
    );
  }

  split(t: number): { left: CubicBezierPoints; right: CubicBezierPoints } {
    const p01   = lerp(this.p0, this.p1, t);
    const p12   = lerp(this.p1, this.p2, t);
    const p23   = lerp(this.p2, this.p3, t);
    const p012  = lerp(p01, p12, t);
    const p123  = lerp(p12, p23, t);
    const p0123 = lerp(p012, p123, t);
    return {
      left:  new CubicBezierPoints(this.p0, p01, p012, p0123),
      right: new CubicBezierPoints(p0123, p123, p23, this.p3),
    };
  }

  offsetAdaptive(offset: number, tolerance = 0.5): CubicBezierPoints[] {
    if (offset === 0) return [this];
    const result: CubicBezierPoints[] = [];
    offsetRecurse(this, offset, tolerance, result, 0);
    return result;
  }

  sub(t1: number, t2: number): CubicBezierPoints {
    if (t1 > t2) {
      const s = this.subForward(t2, t1);
      return new CubicBezierPoints(s.p3, s.p2, s.p1, s.p0);
    }
    return this.subForward(t1, t2);
  }
}

function offsetApproxError(original: CubicBezierPoints, approx: CubicBezierPoints, offset: number): number {
  let maxErr = 0;
  for (const t of [0.25, 0.5, 0.75]) {
    const pos = original.eval(t);
    const n   = perp(normalize(original.evalTangent(t)));
    const trueX = pos.x + n.x * offset;
    const trueY = pos.y + n.y * offset;
    const app = approx.eval(t);
    const err = Math.hypot(trueX - app.x, trueY - app.y);
    if (err > maxErr) maxErr = err;
  }
  return maxErr;
}

function offsetRecurse(
  points: CubicBezierPoints, offset: number, tolerance: number,
  result: CubicBezierPoints[], depth: number,
): void {
  const approx = points.offset(offset);
  if (depth >= 8 || offsetApproxError(points, approx, offset) <= tolerance) {
    result.push(approx);
    return;
  }
  const { left, right } = points.split(0.5);
  offsetRecurse(left,  offset, tolerance, result, depth + 1);
  offsetRecurse(right, offset, tolerance, result, depth + 1);
}

export function bezierListPathData(beziers: CubicBezierPoints[]): string {
  return new PathBuilder().beziers(beziers).build();
}

export function bezierPathData(seg: CubicBezierPoints): string {
  return new PathBuilder().beziers([seg]).build();
}
