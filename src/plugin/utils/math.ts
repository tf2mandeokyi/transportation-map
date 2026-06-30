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