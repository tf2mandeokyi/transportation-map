import { lerp } from "../math";
import { assertValidBiasPair, OffsetT } from "../offset-t";
import { BezierPoints } from "./base";
import { CubicBezierPoints } from "./cubic";

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

  protected evalTangentAt(t: number): Vector {
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

  sub(t1: OffsetT, t2: OffsetT): QuadBezierPoints {
    assertValidBiasPair(t1, t2);
    if (t1.compare(t2) > 0) {
      const s = t2.subBezierForward(this, t1);
      return new QuadBezierPoints(s.p2, s.p1, s.p0);
    }
    return t1.subBezierForward(this, t2);
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