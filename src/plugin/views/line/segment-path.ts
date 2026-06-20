import { Line, MapState, Road } from "../../models/structures";
import { RoadSectionId, StationId } from "@/common/types";
import {
  elevateToCubic,
  evalQuadraticBezier,
  evalQuadraticBezierTangent,
  offsetBezierAdaptive,
  subQuadBezier,
  QuadBezierPoints,
  CubicBezierPoints,
} from "../../utils/bezier";
import { appendGapCurve } from "../../utils/curves";
import { PathBuilder } from "../../utils/path";
import {
  computeRoadBezier,
  computeSectionOffset,
  getLinesForSection,
  lineOffsetInSection,
} from "../../utils/section";

export type SegmentResult =
  | { kind: 'normal'; outline: VectorNode; main: VectorNode }
  | { kind: 'dashed'; node: VectorNode };

// Total lateral offset from the road centerline for this line on this section.
// referenceStationId: which station's stop ranks to use for lane ordering (the
// departure station of the current inter-station segment).
export function computeTotalOffset(
  line: Line, road: Road, sectionId: RoadSectionId,
  state: Readonly<MapState>,
  referenceStationId?: StationId,
): number {
  const section = road.sections.get(sectionId);
  if (!section) return 0;

  const sectionOffset = computeSectionOffset(section, road, state);

  const lines = getLinesForSection(section, state, referenceStationId);
  const lineIndex = lines.findIndex(l => l.id === line.id);
  const effectiveIdx   = lineIndex >= 0 ? lineIndex   : lines.length;
  const effectiveCount = lineIndex >= 0 ? lines.length : lines.length + 1;
  const lineOffset = lineOffsetInSection(effectiveIdx, Math.max(effectiveCount, 1));

  return sectionOffset + lineOffset;
}

// Builds a single cubic bezier that starts at offsetAtT1 from the centerline at t1
// and ends at offsetAtT2 from the centerline at t2, following the road tangents.
// Used for crossing segments where the line changes lateral lane between stations.
export function computeCrossingSeg(
  centerline: QuadBezierPoints,
  t1: number, t2: number,
  offsetAtT1: number, offsetAtT2: number,
): CubicBezierPoints {
  const sign = t1 > t2 ? -1 : 1;

  const pos1 = evalQuadraticBezier(centerline, t1);
  const pos2 = evalQuadraticBezier(centerline, t2);
  const tan1 = evalQuadraticBezierTangent(centerline, t1);
  const tan2 = evalQuadraticBezierTangent(centerline, t2);

  const len1 = Math.hypot(tan1.x, tan1.y) || 1;
  const len2 = Math.hypot(tan2.x, tan2.y) || 1;

  // Perpendicular (90° CCW from centerline tangent), direction-independent.
  const perp1x = -tan1.y / len1;
  const perp1y =  tan1.x / len1;
  const perp2x = -tan2.y / len2;
  const perp2y =  tan2.x / len2;

  const p0 = { x: pos1.x + perp1x * offsetAtT1, y: pos1.y + perp1y * offsetAtT1 };
  const p3 = { x: pos2.x + perp2x * offsetAtT2, y: pos2.y + perp2y * offsetAtT2 };

  // Control points follow the road tangent direction so the curve stays on-road.
  const chord = Math.hypot(p3.x - p0.x, p3.y - p0.y);
  const ctrlLen = Math.max(chord / 3, 1);
  const p1 = { x: p0.x + tan1.x / len1 * sign * ctrlLen, y: p0.y + tan1.y / len1 * sign * ctrlLen };
  const p2 = { x: p3.x - tan2.x / len2 * sign * ctrlLen, y: p3.y - tan2.y / len2 * sign * ctrlLen };

  return { p0, p1, p2, p3 };
}

// Returns the offset bezier segments for one road-section sub-range.
// departureStationId / arrivalStationId: the stations at t1 and t2 respectively.
// When both are provided and the line's lateral offset differs between them, a
// crossing cubic is returned so the line smoothly transitions lanes.
export function computeSectionSegs(
  line: Line, road: Road, sectionId: RoadSectionId,
  t1: number, t2: number,
  state: Readonly<MapState>,
  departureStationId?: StationId,
  arrivalStationId?: StationId,
): CubicBezierPoints[] {
  const centerline = computeRoadBezier(road, state);
  if (!centerline) return [];

  const offsetDep = computeTotalOffset(line, road, sectionId, state, departureStationId);
  const offsetArr = arrivalStationId === undefined
    ? offsetDep
    : computeTotalOffset(line, road, sectionId, state, arrivalStationId);

  // Negate offset for reverse traversal so the backward-parameterized bezier's
  // flipped perpendicular lands on the correct physical side of the road.
  const directedDep = t1 > t2 ? -offsetDep : offsetDep;
  const directedArr = t1 > t2 ? -offsetArr : offsetArr;

  if (directedDep === directedArr) {
    // Non-crossing: adaptive offset for best accuracy.
    const sub = elevateToCubic(subQuadBezier(centerline, t1, t2));
    return directedDep === 0 ? [sub] : offsetBezierAdaptive(sub, directedDep);
  }

  // Crossing: single cubic that transitions from departure lane to arrival lane.
  return [computeCrossingSeg(centerline, t1, t2, directedDep, directedArr)];
}

export function appendJunctionCurve(pb: PathBuilder, prev: CubicBezierPoints, next: CubicBezierPoints): void {
  // Tangent at t=1 of cubic: p3 - p2
  const exitLen = Math.hypot(prev.p3.x - prev.p2.x, prev.p3.y - prev.p2.y);
  const exitDir: Vector = exitLen < 0.001
    ? { x: 1, y: 0 }
    : { x: (prev.p3.x - prev.p2.x) / exitLen, y: (prev.p3.y - prev.p2.y) / exitLen };

  // Tangent at t=0 of cubic: p1 - p0 (negated for "into junction" direction)
  const entryLen = Math.hypot(next.p1.x - next.p0.x, next.p1.y - next.p0.y);
  const entryDir: Vector = entryLen < 0.001
    ? { x: -1, y: 0 }
    : { x: -(next.p1.x - next.p0.x) / entryLen, y: -(next.p1.y - next.p0.y) / entryLen };

  appendGapCurve(pb, prev.p3, exitDir, next.p0, entryDir);
}
