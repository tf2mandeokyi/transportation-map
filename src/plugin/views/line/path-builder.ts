import { Line, LinePath, Road, RoadSection, RoadSectionChange, Station, StationStop } from "../../models/structures";
import { CubicBezierPoints } from "../../utils/bezier";
import { PathBuilder } from "../../utils/path";
import { OffsetT } from "../../utils/offset-t";
import { appendJunctionCurve, computeCrossingSeg, computeSectionSegs, computeTotalOffset } from "./segment-path";

export function isInvalidJump(
  startStation: Station,
  endStation: Station,
  rseBetween: RoadSectionChange[],
): boolean {
  const startRoad = startStation.parentRoadSection.parentRoad;
  const endRoad = endStation.parentRoadSection.parentRoad;
  if (startRoad === endRoad) return false;
  return rseBetween.length === 0;
}

// ── Traversal builder ─────────────────────────────────────────────────────────

type RoadTraversal = {
  road: Road;
  section: RoadSection | null;
  entryT: OffsetT;
  exitT: OffsetT;
  depStation: Station | undefined;
  arrStation: Station | undefined;
  depPathSegIdx: number | undefined;
  arrPathSegIdx: number | undefined;
  depRank: number | undefined;
  arrRank: number | undefined;
};

function buildTraversals(
  rseBetween: RoadSectionChange[],
  startStop: LinePath,
  endStop: LinePath,
): RoadTraversal[] {
  const startStation = startStop.renderStop()!;
  const endStation   = endStop.renderStop()!;
  const startSection = startStation.parentRoadSection;
  const endSection   = endStation.parentRoadSection;
  const startRoad    = startSection.parentRoad;
  const startT       = startStop.end()!.offset;
  const endT         = endStop.start()!.offset;

  const traversals: RoadTraversal[] = [];

  const firstRsc = rseBetween[0];
  traversals.push({
    road: startRoad,
    section: startSection,
    entryT: startT,
    exitT: firstRsc.node === startRoad.endpoints[1].node ? new OffsetT(1, 'negative') : new OffsetT(0, 'positive'),
    depStation: startStation,
    arrStation: undefined,
    depPathSegIdx: startStop.index,
    arrPathSegIdx: undefined,
    depRank: undefined,
    arrRank: firstRsc.exitRank,
  });

  for (let k = 0; k < rseBetween.length - 1; k++) {
    const rsc     = rseBetween[k];
    const nextRsc = rseBetween[k + 1];
    if (!rsc.entering) return traversals;
    const road = rsc.entering.section.parentRoad;
    traversals.push({
      road,
      section: rsc.entering.section,
      entryT: rsc.node === road.endpoints[0].node ? new OffsetT(0, 'positive') : new OffsetT(1, 'negative'),
      exitT:  nextRsc.node === road.endpoints[1].node ? new OffsetT(1, 'negative') : new OffsetT(0, 'positive'),
      depStation: undefined,
      arrStation: undefined,
      depPathSegIdx: undefined,
      arrPathSegIdx: undefined,
      depRank: rsc.enterRank,
      arrRank: nextRsc.exitRank,
    });
  }

  const lastRsc = rseBetween[rseBetween.length - 1];
  if (!lastRsc.entering) return traversals;
  const lastRoad = lastRsc.entering.section.parentRoad;
  // For a U-turn RSC (same section on both sides), use the arrival stop's rank at the
  // turning point — the RSC's enterRank defaults to 0 and doesn't reflect the return lane.
  const isUTurnRsc = lastRsc.exiting !== null && lastRsc.exiting.section === lastRsc.entering.section;
  traversals.push({
    road: lastRoad,
    section: endSection,
    entryT: lastRsc.node === lastRoad.endpoints[0].node ? new OffsetT(0, 'positive') : new OffsetT(1, 'negative'),
    exitT: endT,
    depStation: undefined,
    arrStation: endStation,
    depPathSegIdx: undefined,
    arrPathSegIdx: endStop.index,
    depRank: isUTurnRsc ? (endStop as StationStop).rank : lastRsc.enterRank,
    arrRank: undefined,
  });

  return traversals;
}

function chainBezierEntries(entries: CubicBezierPoints[][]): string {
  const pb = new PathBuilder().beziers(entries[0]);
  for (let i = 1; i < entries.length; i++) {
    const prev = entries[i - 1];
    const curr = entries[i];
    appendJunctionCurve(pb, prev[prev.length - 1], curr[0]);
    for (const { p1, p2, p3 } of curr) pb.cubicTo(p1, p2, p3);
  }
  return pb.build();
}

export function buildSegmentPath(
  line: Line,
  startStop: LinePath,
  endStop: LinePath,
  rseBetween: RoadSectionChange[],
  headCanvas: Vector,
  tailCanvas: Vector,
): string {
  const startStation = startStop.renderStop()!;
  const endStation   = endStop.renderStop()!;
  const startSection = startStation.parentRoadSection;
  const endSection   = endStation.parentRoadSection;
  const startRoad    = startSection.parentRoad;
  const startT       = startStop.end()!.offset;
  const endT         = endStop.start()!.offset;
  const fallback = new PathBuilder().moveTo(headCanvas).lineTo(tailCanvas).build();

  if (startStation === endStation) {
    const centerline = startRoad.computeBezier();
    if (!centerline) return fallback;
    const tangent = centerline.evalTangent(startStop.start()!.offset);
    const tlen = Math.hypot(tangent.x, tangent.y);
    if (tlen < 0.001) return fallback;
    const chord = Math.hypot(tailCanvas.x - headCanvas.x, tailCanvas.y - headCanvas.y);
    const ux = tangent.x / tlen;
    const uy = tangent.y / tlen;
    const p1 = { x: headCanvas.x + ux * chord, y: headCanvas.y + uy * chord };
    const p2 = { x: tailCanvas.x + ux * chord, y: tailCanvas.y + uy * chord };
    return new PathBuilder().moveTo(headCanvas).cubicTo(p1, p2, tailCanvas).build();
  }

  if (rseBetween.length === 0) {
    if (startSection === endSection) {
      const segs = computeSectionSegs(line, startRoad, startSection, startT, endT, startStation, endStation, startStop.index, endStop.index);
      return segs.length === 0 ? fallback : new PathBuilder().beziers(segs).build();
    }
    // Different sections on the same road — single crossing segment.
    const centerline = startRoad.computeBezier();
    if (!centerline) return fallback;
    const offsetDep = computeTotalOffset(line, startSection, startStation, startStop.index);
    const offsetArr = computeTotalOffset(line, endSection,   endStation,   endStop.index);
    const seg = computeCrossingSeg(centerline, startT, endT, offsetDep, offsetArr);
    return new PathBuilder().beziers([seg]).build();
  }

  // Multi-road path.
  const traversals = buildTraversals(rseBetween, startStop, endStop);
  const entries: CubicBezierPoints[][] = [];
  for (const tr of traversals) {
    if (tr.section === null) continue;
    const segs = computeSectionSegs(line, tr.road, tr.section, tr.entryT, tr.exitT, tr.depStation, tr.arrStation, tr.depPathSegIdx, tr.arrPathSegIdx, tr.depRank, tr.arrRank);
    if (segs.length > 0) entries.push(segs);
  }

  return entries.length === 0 ? fallback : chainBezierEntries(entries);
}
