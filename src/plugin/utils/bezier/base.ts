import { distSq } from "../math";
import { OffsetT } from "../offset-t";

const SAMPLES = 20;

export abstract class BezierPoints<T extends BezierPoints<T>> {
  abstract eval(t: number): Vector;
  protected abstract evalTangentAt(t: number): Vector;
  abstract split(t: number): { left: T; right: T };
  abstract sub(t1: OffsetT, t2: OffsetT): T;

  evalTangent(t: number): Vector;
  evalTangent(t: OffsetT): Vector;
  evalTangent(t: number | OffsetT): Vector {
    if (t instanceof OffsetT) return t.evalBezierTangent(this);
    return this.evalTangentAt(t);
  }

  subForward(t1: number, t2: number): T {  // public so OffsetT.subBezierForward can call it
    const { left } = this.split(t2);
    const t1r = t2 > 0.0001 ? t1 / t2 : 0;
    const { right } = left.split(t1r);
    return right;
  }

  nearestT(point: Vector): number {
    let bestT = 0;
    let bestDist = Infinity;
    for (let i = 0; i <= SAMPLES; i++) {
      const t = i / SAMPLES;
      const d = distSq(this.eval(t), point);
      if (d < bestDist) { bestDist = d; bestT = t; }
    }
    let lo = Math.max(0, bestT - 1 / SAMPLES);
    let hi = Math.min(1, bestT + 1 / SAMPLES);
    for (let i = 0; i < 8; i++) {
      const m1 = lo + (hi - lo) / 3;
      const m2 = hi - (hi - lo) / 3;
      if (distSq(this.eval(m1), point) < distSq(this.eval(m2), point)) {
        hi = m2;
      } else {
        lo = m1;
      }
    }
    return (lo + hi) / 2;
  }

  sectionPosAt(t: number, offset: number): Vector {
    const pos = this.eval(t);
    if (offset === 0) return pos;
    const tangent = this.evalTangent(t);
    const len = Math.hypot(tangent.x, tangent.y);
    if (len < 0.001) return pos;
    return { x: pos.x + (-tangent.y / len) * offset, y: pos.y + (tangent.x / len) * offset };
  }
}