import { Line, MapState, Road, RoadSectionChange, Station } from "../../models/structures";
import { RoadSectionId, StationId } from "@/common/types";
import { CubicBezierPoints } from "../../utils/bezier";
import { PathBuilder } from "../../utils/path";
import { computeRoadBezier, findRoadForSection, getLineDirectionAtStop, getLineDepartureAtStop } from "../../utils/section";
import { appendJunctionCurve, computeCrossingSeg, computeSectionSegs, computeTotalOffset } from "./segment-path";

export function isInvalidJump(
  startStation: Station,
  endStation: Station,
  rseBetween: RoadSectionChange[],
  state: Readonly<MapState>
): boolean {
  if (!startStation.roadSectionId || !endStation.roadSectionId) return false;
  const startRoad = findRoadForSection(startStation.roadSectionId, state);
  const endRoad   = findRoadForSection(endStation.roadSectionId,   state);
  if (!startRoad || !endRoad || startRoad.id === endRoad.id) return false;
  return rseBetween.length === 0;
}

// ── Traversal builder ─────────────────────────────────────────────────────────

type RoadTraversal = {
  road: Road;
  sectionId: RoadSectionId | null;
  entryT: number;
  exitT: number;
  depStationId: StationId | undefined;
  arrStationId: StationId | undefined;
  depPathSegIdx: number | undefined;
  arrPathSegIdx: number | undefined;
};

// Converts an RSC sequence into an ordered list of (road, entryT, exitT) traversals.
// Handles U-turns (same road re-entered) by allowing the same road twice.
function buildTraversals(
  rseBetween: RoadSectionChange[],
  startRoad: Road,
  startStation: Station, endStation: Station,
  startSectionId: RoadSectionId, endSectionId: RoadSectionId,
  startPathIdx: number, endPathIdx: number,
  state: Readonly<MapState>,
): RoadTraversal[] {
  const traversals: RoadTraversal[] = [];

  const firstRsc = rseBetween[0];
  traversals.push({
    road: startRoad,
    sectionId: startSectionId,
    entryT: startStation.interpT,
    exitT: firstRsc.nodeId === startRoad.endNodeId ? 1 : 0,
    depStationId: startStation.id,
    arrStationId: undefined,
    depPathSegIdx: startPathIdx,
    arrPathSegIdx: undefined,
  });

  for (let k = 0; k < rseBetween.length - 1; k++) {
    const rsc     = rseBetween[k];
    const nextRsc = rseBetween[k + 1];
    if (!rsc.entering) return traversals;
    const road = findRoadForSection(rsc.entering, state);
    if (!road) return traversals;
    traversals.push({
      road,
      sectionId: rsc.entering,
      entryT: rsc.nodeId === road.startNodeId ? 0 : 1,
      exitT:  nextRsc.nodeId === road.endNodeId ? 1 : 0,
      depStationId: undefined,
      arrStationId: undefined,
      depPathSegIdx: undefined,
      arrPathSegIdx: undefined,
    });
  }

  const lastRsc  = rseBetween[rseBetween.length - 1];
  if (!lastRsc.entering) return traversals;
  const lastRoad = findRoadForSection(lastRsc.entering, state);
  if (!lastRoad) return traversals;
  traversals.push({
    road: lastRoad,
    sectionId: endSectionId,
    entryT: lastRsc.nodeId === lastRoad.startNodeId ? 0 : 1,
    exitT: endStation.interpT,
    depStationId: undefined,
    arrStationId: endStation.id,
    depPathSegIdx: undefined,
    arrPathSegIdx: endPathIdx,
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
  const startSectionId = startStation.roadSectionId;
  const endSectionId   = endStation.roadSectionId;
  if (!startSectionId || !endSectionId) return `M ${headCanvas.x} ${headCanvas.y} L ${tailCanvas.x} ${tailCanvas.y}`;

  const startRoad = findRoadForSection(startSectionId, state);
  const endRoad   = findRoadForSection(endSectionId,   state);
  if (!startRoad || !endRoad) return `M ${headCanvas.x} ${headCanvas.y} L ${tailCanvas.x} ${tailCanvas.y}`;

  const fallback = new PathBuilder().moveTo(headCanvas).lineTo(tailCanvas).build();
  const t1 = startStation.interpT;
  const t2 = endStation.interpT;

  if (rseBetween.length === 0) {
    if (startSectionId === endSectionId) {
      // Standard same-section segment.
      const segs = computeSectionSegs(line, startRoad, startSectionId, t1, t2, state, startStation.id, endStation.id, startPathIdx, endPathIdx);
      return segs.length === 0 ? fallback : new PathBuilder().beziers(segs).build();
    }
    // Case 4: different sections on the same road — single crossing segment.
    const centerline = computeRoadBezier(startRoad, state);
    if (!centerline) return fallback;
    const startArrDir = getLineDirectionAtStop(line, startPathIdx, state);
    const startDepDir = getLineDepartureAtStop(line, startPathIdx, state);
    const isStartUturnDep = startDepDir !== null && startDepDir !== startArrDir;
    const sign      = t1 > t2 ? -1 : 1;
    const offsetDep = computeTotalOffset(line, startRoad, startSectionId, state, startStation.id, startPathIdx, isStartUturnDep);
    const offsetArr = computeTotalOffset(line, startRoad, endSectionId,   state, endStation.id,   endPathIdx);
    const seg = computeCrossingSeg(centerline, t1, t2, sign * offsetDep, sign * offsetArr);
    return new PathBuilder().beziers([seg]).build();
  }

  // Multi-road path or same-road U-turn via RSE (Cases 1 & 2).
  const traversals = buildTraversals(
    rseBetween, startRoad,
    startStation, endStation, startSectionId, endSectionId,
    startPathIdx, endPathIdx,
    state,
  );

  const entries: CubicBezierPoints[][] = [];
  for (const tr of traversals) {
    if (tr.sectionId === null) continue;
    const segs = computeSectionSegs(line, tr.road, tr.sectionId, tr.entryT, tr.exitT, state, tr.depStationId, tr.arrStationId, tr.depPathSegIdx, tr.arrPathSegIdx);
    if (segs.length > 0) entries.push(segs);
  }

  return entries.length === 0 ? fallback : chainBezierEntries(entries);
}
