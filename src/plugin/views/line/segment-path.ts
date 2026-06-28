import { lineOffsetInSection } from "@/plugin/utils/constants";
import { Line, Road, RoadSection, Station } from "../../models/structures";
import { QuadBezierPoints, CubicBezierPoints } from "../../utils/bezier";
import { appendGapCurve } from "../../utils/curves";
import { PathBuilder } from "../../utils/path";

export type SegmentResult =
  | { kind: 'normal'; outline: VectorNode; main: VectorNode }
  | { kind: 'dashed'; node: VectorNode };

// Total lateral offset from the road centerline for this line on this section.
export function computeTotalOffset(
  line: Line, section: RoadSection,
  referenceStation?: Station,
  pathSegmentIndex?: number,
  forceRank?: number,
): number {
  const sectionOffset = section.computeOffset();

  const totalPasses = section.getLines();
  let effectiveIdx: number;
  if (forceRank === undefined) {
    const passes = section.getLines(referenceStation);
    const passIndex = pathSegmentIndex === undefined
      ? passes.findIndex(lp => lp.line === line)
      : passes.findIndex(lp => lp.line === line && lp.segmentIndex === pathSegmentIndex);
    effectiveIdx = passIndex >= 0 ? passIndex : totalPasses.length;
  } else {
    effectiveIdx = forceRank;
  }
  const effectiveCount = Math.max(totalPasses.length, effectiveIdx + 1);
  const lineOffset = lineOffsetInSection(effectiveIdx, effectiveCount);

  return sectionOffset + lineOffset;
}

// Builds a single cubic bezier that starts at offsetAtT1 from the centerline at t1
// and ends at offsetAtT2 from the centerline at t2, following the road tangents.
export function computeCrossingSeg(
  centerline: QuadBezierPoints,
  t1: number, t2: number,
  offsetAtT1: number, offsetAtT2: number,
): CubicBezierPoints {
  const sign = t1 > t2 ? -1 : 1;

  const pos1 = centerline.eval(t1);
  const pos2 = centerline.eval(t2);
  const tan1 = centerline.evalTangent(t1);
  const tan2 = centerline.evalTangent(t2);

  const len1 = Math.hypot(tan1.x, tan1.y) || 1;
  const len2 = Math.hypot(tan2.x, tan2.y) || 1;

  const perp1x = -tan1.y / len1;
  const perp1y =  tan1.x / len1;
  const perp2x = -tan2.y / len2;
  const perp2y =  tan2.x / len2;

  const p0 = { x: pos1.x + perp1x * offsetAtT1, y: pos1.y + perp1y * offsetAtT1 };
  const p3 = { x: pos2.x + perp2x * offsetAtT2, y: pos2.y + perp2y * offsetAtT2 };

  const chord = Math.hypot(p3.x - p0.x, p3.y - p0.y);
  const ctrlLen = Math.max(chord / 3, 1);
  const p1 = { x: p0.x + tan1.x / len1 * sign * ctrlLen, y: p0.y + tan1.y / len1 * sign * ctrlLen };
  const p2 = { x: p3.x - tan2.x / len2 * sign * ctrlLen, y: p3.y - tan2.y / len2 * sign * ctrlLen };

  return new CubicBezierPoints(p0, p1, p2, p3);
}

export function computeSectionSegs(
  line: Line, road: Road, section: RoadSection,
  t1: number, t2: number,
  departureStation?: Station,
  arrivalStation?: Station,
  depPathSegIdx?: number,
  arrPathSegIdx?: number,
  depRank?: number,
  arrRank?: number,
): CubicBezierPoints[] {
  const centerline = road.computeBezier();
  if (!centerline) return [];

  const offsetDep = computeTotalOffset(line, section, departureStation, depPathSegIdx, departureStation === undefined ? depRank : undefined);
  const offsetArr = arrivalStation === undefined
    ? (arrRank !== undefined ? computeTotalOffset(line, section, undefined, undefined, arrRank) : offsetDep)
    : computeTotalOffset(line, section, arrivalStation, arrPathSegIdx);

  const directedDep = t1 > t2 ? -offsetDep : offsetDep;
  const directedArr = t1 > t2 ? -offsetArr : offsetArr;

  if (directedDep === directedArr) {
    const sub = centerline.sub(t1, t2).elevateToCubic();
    return directedDep === 0 ? [sub] : sub.offsetAdaptive(directedDep);
  }

  return [computeCrossingSeg(centerline, t1, t2, directedDep, directedArr)];
}

export function appendJunctionCurve(pb: PathBuilder, prev: CubicBezierPoints, next: CubicBezierPoints): void {
  const exitLen = Math.hypot(prev.p3.x - prev.p2.x, prev.p3.y - prev.p2.y);
  const exitDir: Vector = exitLen < 0.001
    ? { x: 1, y: 0 }
    : { x: (prev.p3.x - prev.p2.x) / exitLen, y: (prev.p3.y - prev.p2.y) / exitLen };

  const entryLen = Math.hypot(next.p1.x - next.p0.x, next.p1.y - next.p0.y);
  const entryDir: Vector = entryLen < 0.001
    ? { x: -1, y: 0 }
    : { x: -(next.p1.x - next.p0.x) / entryLen, y: -(next.p1.y - next.p0.y) / entryLen };

  appendGapCurve(pb, prev.p3, exitDir, next.p0, entryDir);
}
