import { MapState } from '../models/structures';
import { RoadSectionId } from '@/common/types';
import { QuadBezierPoints, evalQuadraticBezier, evalQuadraticBezierTangent, TRACK_SPACING } from './bezier';
import { computeRoadBezier } from './section';

const SAMPLES = 20;

function distSq(a: Vector, b: Vector): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

function nearestTOnQuadBezier(bezier: QuadBezierPoints, point: Vector): number {
  let bestT = 0;
  let bestDist = Infinity;
  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES;
    const d = distSq(evalQuadraticBezier(bezier, t), point);
    if (d < bestDist) { bestDist = d; bestT = t; }
  }
  // Golden-section refine within the nearest sample interval
  let lo = Math.max(0, bestT - 1 / SAMPLES);
  let hi = Math.min(1, bestT + 1 / SAMPLES);
  for (let i = 0; i < 8; i++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    if (distSq(evalQuadraticBezier(bezier, m1), point) < distSq(evalQuadraticBezier(bezier, m2), point)) {
      hi = m2;
    } else {
      lo = m1;
    }
  }
  return (lo + hi) / 2;
}

function sectionPosAt(bezier: QuadBezierPoints, t: number, sectionIndex: number, numSections: number): Vector {
  const center = (numSections - 1) / 2;
  const offset = (sectionIndex - center) * TRACK_SPACING;
  const pos = evalQuadraticBezier(bezier, t);
  if (offset === 0) return pos;
  const tangent = evalQuadraticBezierTangent(bezier, t);
  const len = Math.hypot(tangent.x, tangent.y);
  if (len < 0.001) return pos;
  return { x: pos.x + (-tangent.y / len) * offset, y: pos.y + (tangent.x / len) * offset };
}

export interface SnapResult {
  roadSectionId: RoadSectionId;
  interpT: number;
  pos: Vector;
}

export function findNearestRoadSection(point: Vector, state: Readonly<MapState>): SnapResult | null {
  let best: SnapResult | null = null;
  let bestDist = Infinity;

  for (const road of state.roads.values()) {
    const bezier = computeRoadBezier(road, state);
    if (!bezier) continue;
    const sections = Array.from(road.sections.values());
    if (sections.length === 0) continue;

    const t = nearestTOnQuadBezier(bezier, point);

    for (const section of sections) {
      const pos = sectionPosAt(bezier, t, section.index, sections.length);
      const d = distSq(pos, point);
      if (d < bestDist) {
        bestDist = d;
        best = { roadSectionId: section.id, interpT: t, pos };
      }
    }
  }

  return best;
}
