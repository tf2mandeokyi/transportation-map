export type TBias = 'positive' | 'zero' | 'negative';

const BIAS_ORDER: Record<TBias, number> = { negative: -1, zero: 0, positive: 1 };

export class OffsetT {
  constructor(
    readonly value: number,
    readonly bias: TBias = 'zero',
  ) {}

  toFloat(): number {
    return this.value;
  }

  toFloatWithBias(amount: number): number {
    if (this.bias === 'positive') return this.value + amount;
    if (this.bias === 'negative') return this.value - amount;
    return this.value;
  }

  compare(other: OffsetT): number {
    if (this.value !== other.value) return this.value - other.value;
    return BIAS_ORDER[this.bias] - BIAS_ORDER[other.bias];
  }
}

export function assertValidBiasPair(t1: OffsetT, t2: OffsetT): void {
  if (t1.bias !== 'zero' && t1.bias === t2.bias) {
    console.error(`Invalid OffsetT pair: both biases are '${t1.bias}' (values: ${t1.value}, ${t2.value})`);
  }
}
