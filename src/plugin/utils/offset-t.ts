export type TBias = 'positive' | 'zero' | 'negative';

const BIAS_ORDER: Record<TBias, number> = { negative: -1, zero: 0, positive: 1 };

type WithEval = { eval(t: number): Vector; evalTangent(t: number): Vector };

export class OffsetT {
  constructor(
    private readonly value: number,
    private readonly bias: TBias = 'zero',
  ) {}

  compare(other: OffsetT): number {
    if (this.value !== other.value) return this.value - other.value;
    return BIAS_ORDER[this.bias] - BIAS_ORDER[other.bias];
  }

  withBias(bias: TBias): OffsetT { return new OffsetT(this.value, bias); }

  evalBezier(bezier: WithEval): Vector {
    return bezier.eval(this.value);
  }

  evalBezierTangent(bezier: WithEval): Vector {
    const raw = bezier.evalTangent(this.value);
    return this.bias === 'positive' ? { x: -raw.x, y: -raw.y } : raw;
  }

  // Raw geometric tangent — no bias flip. Use when shaping curves, not for travel direction.
  geometricTangent(bezier: WithEval): Vector {
    return bezier.evalTangent(this.value);
  }

  // Delegates bezier.subForward using this OffsetT's private value. Used by BezierPoints.sub().
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  subBezierForward(bezier: { subForward(t1: number, t2: number): any }, to: OffsetT): any {
    return bezier.subForward(this.value, to.value);
  }

  static assertValidPair(t1: OffsetT, t2: OffsetT): void {
    if (t1.bias !== 'zero' && t1.bias === t2.bias) {
      console.error(`Invalid OffsetT pair: both biases are '${t1.bias}' (values: ${t1.value}, ${t2.value})`);
    }
  }
}

export function assertValidBiasPair(t1: OffsetT, t2: OffsetT): void {
  OffsetT.assertValidPair(t1, t2);
}
