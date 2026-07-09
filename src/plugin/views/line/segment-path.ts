import { lineOffsetInSection } from "@/plugin/utils/constants";
import { Line, Road, RoadSection, Station } from "../../models/structures";
import { QuadBezierPoints, CubicBezierPoints } from "../../utils/bezier";
import { appendGapCurve } from "../../utils/curves";
import { PathBuilder } from "../../utils/path";
import { OffsetT } from "../../utils/offset-t";

// Total lateral offset from the road centerline for this line on this section.
export function computeTotalOffset(
  line: Line, section: RoadSection,
  referenceStation?: Station,
  pathGroupIndex?: number,
  pathStopIndex?: number,
  forceRank?: number,
): number {
  const sectionOffset = section.computeOffset();

  const totalSlots = section.getMaxStationStopCount();
  let effectiveIdx: number;
  if (forceRank === undefined) {
    const passes = referenceStation ? referenceStation.getLinePasses() : section.getLines();
    const passIndex = pathGroupIndex === undefined
      ? passes.findIndex(lp => lp.line === line)
      : passes.findIndex(lp => lp.line === line && lp.groupIndex === pathGroupIndex && lp.stopIndex === pathStopIndex);
    effectiveIdx = passIndex >= 0 ? passIndex : totalSlots;
  } else {
    effectiveIdx = forceRank;
  }
  const effectiveCount = Math.max(totalSlots, effectiveIdx + 1);
  const lineOffset = lineOffsetInSection(effectiveIdx, effectiveCount);

  return sectionOffset + lineOffset;
}

// Builds a single cubic bezier that starts at offsetAtT1 from the centerline at t1
// and ends at offsetAtT2 from the centerline at t2, following the road tangents.
export function computeCrossingSeg(
  centerline: QuadBezierPoints,
  t1: OffsetT, t2: OffsetT,
  offsetAtT1: number, offsetAtT2: number,
): CubicBezierPoints {
  const sign = t1.compare(t2) > 0 ? -1 : 1;

  const pos1 = t1.evalBezier(centerline);
  const pos2 = t2.evalBezier(centerline);
  const tan1 = t1.geometricTangent(centerline);
  const tan2 = t2.geometricTangent(centerline);

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
  road: Road,
  t1: OffsetT, t2: OffsetT,
  offsetDep: number, offsetArr: number,
): CubicBezierPoints[] {
  const centerline = road.computeBezier();
  if (!centerline) return [];

  const backward = t1.compare(t2) > 0;
  const directedDep = backward ? -offsetDep : offsetDep;
  const directedArr = backward ? -offsetArr : offsetArr;

  if (directedDep === directedArr) {
    const sub = centerline.sub(t1, t2).elevateToCubic();
    return directedDep === 0 ? [sub] : sub.offsetAdaptive(directedDep);
  }

  return [computeCrossingSeg(centerline, t1, t2, offsetDep, offsetArr)];
}

// Point at a section boundary (side 0 or 1), offset laterally by `offset` — using
// the same unsigned, raw-tangent-perpendicular convention as computeCrossingSeg /
// computeSectionSegs above. RoadSectionChange.computeStartPosition/computeEndPosition
// (line-path/rsc.ts) use a DIFFERENT sign convention (flips for side-1/non-start
// nodes, meant for node-facing UI like RSE handles) and will not line up with actual
// solid-path geometry — don't substitute those here.
export function computeBoundaryPoint(section: RoadSection, side: 0 | 1, offset: number): Vector | undefined {
  const bezier = section.parentRoad.computeBezier();
  if (!bezier) return undefined;
  const t = new OffsetT(side, side === 0 ? 'positive' : 'negative');
  const pos = t.evalBezier(bezier);
  const tan = t.geometricTangent(bezier);
  const len = Math.hypot(tan.x, tan.y) || 1;
  return { x: pos.x + (-tan.y / len) * offset, y: pos.y + (tan.x / len) * offset };
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
