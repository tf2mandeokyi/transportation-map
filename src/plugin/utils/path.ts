import { BezierPoints } from './bezier';

export class PathBuilder {
  private readonly parts: string[] = [];

  moveTo(p: Vector): this {
    this.parts.push(`M ${p.x} ${p.y}`);
    return this;
  }

  lineTo(p: Vector): this {
    this.parts.push(`L ${p.x} ${p.y}`);
    return this;
  }

  cubicTo(cp1: Vector, cp2: Vector, end: Vector): this {
    this.parts.push(`C ${cp1.x} ${cp1.y} ${cp2.x} ${cp2.y} ${end.x} ${end.y}`);
    return this;
  }

  close(): this {
    this.parts.push('Z');
    return this;
  }

  // Appends a connected chain of cubic bezier segments, starting with M at the first p0.
  beziers(segs: BezierPoints[]): this {
    if (segs.length === 0) return this;
    this.moveTo(segs[0].p0);
    for (const { p1, p2, p3 } of segs) this.cubicTo(p1, p2, p3);
    return this;
  }

  build(): string {
    return this.parts.join(' ');
  }
}
