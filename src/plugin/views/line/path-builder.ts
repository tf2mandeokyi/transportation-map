import { Line, MapState, Road, RoadSectionEnter, Station } from "../../models/structures";
import { RoadSectionId, StationId } from "@/common/types";
import { CubicBezierPoints } from "../../utils/bezier";
import { PathBuilder } from "../../utils/path";
import { findRoadForSection } from "../../utils/section";
import { computeSectionSegs, appendJunctionCurve } from "./segment-path";

export function isInvalidJump(
  startStation: Station,
  endStation: Station,
  rseBetween: RoadSectionEnter[],
  state: Readonly<MapState>
): boolean {
  if (!startStation.roadSectionId || !endStation.roadSectionId) return false;
  const startRoad = findRoadForSection(startStation.roadSectionId, state);
  const endRoad   = findRoadForSection(endStation.roadSectionId,   state);
  if (!startRoad || !endRoad || startRoad.id === endRoad.id) return false;
  return rseBetween.length === 0;
}

function buildRoadSequence(rseBetween: RoadSectionEnter[], startRoad: Road, endRoad: Road, state: Readonly<MapState>): Road[] {
  const roadSeq: Road[] = [startRoad];
  for (const rse of rseBetween) {
    const road = state.roads.get(rse.destRoadId);
    if (road && roadSeq[roadSeq.length - 1].id !== road.id) roadSeq.push(road);
  }
  if (roadSeq[roadSeq.length - 1].id !== endRoad.id) roadSeq.push(endRoad);
  return roadSeq;
}

function resolveSectionId(
  i: number, last: number, road: Road,
  startSectionId: RoadSectionId, endSectionId: RoadSectionId
): RoadSectionId | null {
  if (i === 0)    return startSectionId;
  if (i === last) return endSectionId;
  const firstSec = road.sections.values().next().value;
  return firstSec ? firstSec.id : null;
}

function resolveEntryT(
  i: number, road: Road,
  rseByDest: Map<string, RoadSectionEnter>, startStation: Station
): number | null {
  if (i === 0) return startStation.interpT;
  const rse = rseByDest.get(road.id);
  if (!rse) return null;
  return rse.nodeId === road.startNodeId ? 0 : 1;
}

function resolveExitT(
  i: number, last: number, road: Road, roadSeq: Road[],
  rseByDest: Map<string, RoadSectionEnter>, endStation: Station
): number | null {
  if (i === last) return endStation.interpT;
  const rse = rseByDest.get(roadSeq[i + 1].id);
  if (!rse) return null;
  return rse.nodeId === road.endNodeId ? 1 : 0;
}

function buildMultiRoadEntries(
  line: Line, roadSeq: Road[], rseByDest: Map<string, RoadSectionEnter>,
  startStation: Station, endStation: Station,
  startSectionId: RoadSectionId, endSectionId: RoadSectionId,
  state: Readonly<MapState>
): CubicBezierPoints[][] {
  const last = roadSeq.length - 1;
  const entries: CubicBezierPoints[][] = [];

  for (let i = 0; i <= last; i++) {
    const road = roadSeq[i];
    const sectionId = resolveSectionId(i, last, road, startSectionId, endSectionId);
    const entryT    = resolveEntryT(i, road, rseByDest, startStation);
    const exitT     = resolveExitT(i, last, road, roadSeq, rseByDest, endStation);
    if (sectionId === null || entryT === null || exitT === null) continue;

    const depId: StationId | undefined = i === 0    ? startStation.id : undefined;
    const arrId: StationId | undefined = i === last ? endStation.id   : undefined;
    const segs = computeSectionSegs(line, road, sectionId, entryT, exitT, state, depId, arrId);
    if (segs.length > 0) entries.push(segs);
  }
  return entries;
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
  rseBetween: RoadSectionEnter[],
  headCanvas: Vector,
  tailCanvas: Vector,
  state: Readonly<MapState>
): string {
  const startSectionId = startStation.roadSectionId;
  const endSectionId   = endStation.roadSectionId;
  if (!startSectionId || !endSectionId) return `M ${headCanvas.x} ${headCanvas.y} L ${tailCanvas.x} ${tailCanvas.y}`;

  const startRoad = findRoadForSection(startSectionId, state);
  const endRoad   = findRoadForSection(endSectionId,   state);
  if (!startRoad || !endRoad) return `M ${headCanvas.x} ${headCanvas.y} L ${tailCanvas.x} ${tailCanvas.y}`;

  const fallback = new PathBuilder().moveTo(headCanvas).lineTo(tailCanvas).build();
  const roadSeq  = buildRoadSequence(rseBetween, startRoad, endRoad, state);
  const rseByDest = new Map(rseBetween.map(rse => [rse.destRoadId, rse]));

  if (roadSeq.length === 1) {
    const segs = computeSectionSegs(
      line, startRoad, startSectionId, startStation.interpT, endStation.interpT, state,
      startStation.id, endStation.id,
    );
    return segs.length === 0 ? fallback : new PathBuilder().beziers(segs).build();
  }

  const entries = buildMultiRoadEntries(
    line, roadSeq, rseByDest,
    startStation, endStation, startSectionId, endSectionId, state
  );
  return entries.length === 0 ? fallback : chainBezierEntries(entries);
}
