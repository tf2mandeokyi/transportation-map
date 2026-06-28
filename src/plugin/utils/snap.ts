import { MapState, RoadSection } from '../models/structures';
import { QuadBezierPoints } from './bezier';

const SAMPLES = 20;

function distSq(a: Vector, b: Vector): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

function nearestTOnQuadBezier(bezier: QuadBezierPoints, point: Vector): number {
  let bestT = 0;
  let bestDist = Infinity;
  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES;
    const d = distSq(bezier.eval(t), point);
    if (d < bestDist) { bestDist = d; bestT = t; }
  }
  let lo = Math.max(0, bestT - 1 / SAMPLES);
  let hi = Math.min(1, bestT + 1 / SAMPLES);
  for (let i = 0; i < 8; i++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    if (distSq(bezier.eval(m1), point) < distSq(bezier.eval(m2), point)) {
      hi = m2;
    } else {
      lo = m1;
    }
  }
  return (lo + hi) / 2;
}

function sectionPosAt(bezier: QuadBezierPoints, t: number, offset: number): Vector {
  const pos = bezier.eval(t);
  if (offset === 0) return pos;
  const tangent = bezier.evalTangent(t);
  const len = Math.hypot(tangent.x, tangent.y);
  if (len < 0.001) return pos;
  return { x: pos.x + (-tangent.y / len) * offset, y: pos.y + (tangent.x / len) * offset };
}

export interface SnapResult {
  section: RoadSection;
  interpT: number;
  pos: Vector;
}

export function findNearestRoadSection(point: Vector, state: Readonly<MapState>): SnapResult | null {
  let best: SnapResult | null = null;
  let bestDist = Infinity;

  for (const road of state.getRoads()) {
    const bezier = road.computeBezier();
    if (!bezier) continue;
    const sections = [...road.getSections()];
    if (sections.length === 0) continue;

    const t = nearestTOnQuadBezier(bezier, point);

    for (const section of sections) {
      const pos = sectionPosAt(bezier, t, section.computeOffset());
      const d = distSq(pos, point);
      if (d < bestDist) {
        bestDist = d;
        best = { section, interpT: t, pos };
      }
    }
  }

  return best;
}
