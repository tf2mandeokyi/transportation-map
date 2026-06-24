import { Line, MapState, Road, RoadSection, RoadSectionChange, Station } from "../../models/structures";
import { StationId } from "@/common/types";
import { CubicBezierPoints } from "../../utils/bezier";
import { PathBuilder } from "../../utils/path";
import { appendJunctionCurve, computeCrossingSeg, computeSectionSegs, computeTotalOffset } from "./segment-path";

export function isInvalidJump(
  startStation: Station,
  endStation: Station,
  rseBetween: RoadSectionChange[],
): boolean {
  if (!startStation.roadSection || !endStation.roadSection) return false;
  const startRoad = startStation.roadSection.road;
  const endRoad   = endStation.roadSection.road;
  if (startRoad.id === endRoad.id) return false;
  return rseBetween.length === 0;
}

// ── Traversal builder ─────────────────────────────────────────────────────────

type RoadTraversal = {
  road: Road;
  section: RoadSection | null;
  entryT: number;
  exitT: number;
  depStationId: StationId | undefined;
  arrStationId: StationId | undefined;
  depPathSegIdx: number | undefined;
  arrPathSegIdx: number | undefined;
  depRank: number | undefined;
  arrRank: number | undefined;
};

function buildTraversals(
  rseBetween: RoadSectionChange[],
  startRoad: Road,
  startStation: Station, endStation: Station,
  startSection: RoadSection, endSection: RoadSection,
  startPathIdx: number, endPathIdx: number,
): RoadTraversal[] {
  const traversals: RoadTraversal[] = [];

  const firstRsc = rseBetween[0];
  traversals.push({
    road: startRoad,
    section: startSection,
    entryT: startStation.interpT,
    exitT: firstRsc.node.id === startRoad.endNode.id ? 1 : 0,
    depStationId: startStation.id,
    arrStationId: undefined,
    depPathSegIdx: startPathIdx,
    arrPathSegIdx: undefined,
    depRank: undefined,
    arrRank: firstRsc.exitRank,
  });

  for (let k = 0; k < rseBetween.length - 1; k++) {
    const rsc     = rseBetween[k];
    const nextRsc = rseBetween[k + 1];
    if (!rsc.entering) return traversals;
    const road = rsc.entering.road;
    traversals.push({
      road,
      section: rsc.entering,
      entryT: rsc.node.id === road.startNode.id ? 0 : 1,
      exitT:  nextRsc.node.id === road.endNode.id ? 1 : 0,
      depStationId: undefined,
      arrStationId: undefined,
      depPathSegIdx: undefined,
      arrPathSegIdx: undefined,
      depRank: rsc.enterRank,
      arrRank: nextRsc.exitRank,
    });
  }

  const lastRsc = rseBetween[rseBetween.length - 1];
  if (!lastRsc.entering) return traversals;
  const lastRoad = lastRsc.entering.road;
  traversals.push({
    road: lastRoad,
    section: endSection,
    entryT: lastRsc.node.id === lastRoad.startNode.id ? 0 : 1,
    exitT: endStation.interpT,
    depStationId: undefined,
    arrStationId: endStation.id,
    depPathSegIdx: undefined,
    arrPathSegIdx: endPathIdx,
    depRank: lastRsc.enterRank,
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
  startStation: Station,
  endStation: Station,
  rseBetween: RoadSectionChange[],
  headCanvas: Vector,
  tailCanvas: Vector,
  state: Readonly<MapState>,
  startPathIdx: number,
  endPathIdx: number,
): string {
  const startSection = startStation.roadSection;
  const endSection   = endStation.roadSection;
  if (!startSection || !endSection) return `M ${headCanvas.x} ${headCanvas.y} L ${tailCanvas.x} ${tailCanvas.y}`;

  const startRoad = startSection.road;
  const endRoad   = endSection.road;
  if (!startRoad || !endRoad) return `M ${headCanvas.x} ${headCanvas.y} L ${tailCanvas.x} ${tailCanvas.y}`;

  const fallback = new PathBuilder().moveTo(headCanvas).lineTo(tailCanvas).build();
  const t1 = startStation.interpT;
  const t2 = endStation.interpT;

  if (rseBetween.length === 0) {
    if (startSection === endSection) {
      const segs = computeSectionSegs(line, startRoad, startSection, t1, t2, state, startStation.id, endStation.id, startPathIdx, endPathIdx);
      return segs.length === 0 ? fallback : new PathBuilder().beziers(segs).build();
    }
    // Different sections on the same road — single crossing segment.
    const centerline = startRoad.computeBezier();
    if (!centerline) return fallback;
    const sign      = t1 > t2 ? -1 : 1;
    const offsetDep = computeTotalOffset(line, startRoad, startSection, state, startStation.id, startPathIdx);
    const offsetArr = computeTotalOffset(line, startRoad, endSection,   state, endStation.id,   endPathIdx);
    const seg = computeCrossingSeg(centerline, t1, t2, sign * offsetDep, sign * offsetArr);
    return new PathBuilder().beziers([seg]).build();
  }

  // Multi-road path or same-road U-turn via RSE.
  const traversals = buildTraversals(
    rseBetween, startRoad,
    startStation, endStation, startSection, endSection,
    startPathIdx, endPathIdx,
  );

  const entries: CubicBezierPoints[][] = [];
  for (const tr of traversals) {
    if (tr.section === null) continue;
    const segs = computeSectionSegs(line, tr.road, tr.section, tr.entryT, tr.exitT, state, tr.depStationId, tr.arrStationId, tr.depPathSegIdx, tr.arrPathSegIdx, tr.depRank, tr.arrRank);
    if (segs.length > 0) entries.push(segs);
  }

  return entries.length === 0 ? fallback : chainBezierEntries(entries);
}
