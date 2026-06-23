import { Line, LinePath, MapState, Road, RoadSectionChange, Station, StationStop } from "../models/structures";
import { NodeId, RoadSectionId, StationId } from "@/common/types";
import { findRoadForSection } from "./section";

function findRoadForStation(station: Station, state: Readonly<MapState>): Road | null {
  return station.roadSectionId ? findRoadForSection(station.roadSectionId, state) : null;
}

function findSharedNode(roadA: Road, roadB: Road): NodeId | null {
  if (roadA.endNodeId === roadB.startNodeId || roadA.endNodeId === roadB.endNodeId) return roadA.endNodeId;
  if (roadA.startNodeId === roadB.startNodeId || roadA.startNodeId === roadB.endNodeId) return roadA.startNodeId;
  return null;
}

// ── Pass-through helpers ──────────────────────────────────────────────────────

type RoadSpan = { road: Road; tEntry: number; tExit: number; sectionId: RoadSectionId | null };

// Decomposes a segment (dep → arr, with the RSEs between them) into a sequence of
// road spans, each with the entry and exit interpT values on that road.
// Always returns exactly rsesBetween.length + 1 spans, or fewer if data is missing.
function getRoadSpans(
  depStation: Station,
  arrStation: Station,
  rsesBetween: RoadSectionChange[],
  state: Readonly<MapState>,
): RoadSpan[] {
  const depRoad = findRoadForStation(depStation, state);
  const arrRoad = findRoadForStation(arrStation, state);
  if (!depRoad || !arrRoad) return [];

  if (rsesBetween.length === 0) {
    if (depRoad.id !== arrRoad.id) return [];
    return [{ road: depRoad, tEntry: depStation.interpT, tExit: arrStation.interpT, sectionId: depStation.roadSectionId }];
  }

  const spans: RoadSpan[] = [];

  // First span: departure station → first junction node.
  const firstRsc = rsesBetween[0];
  spans.push({
    road: depRoad,
    tEntry: depStation.interpT,
    tExit: firstRsc.nodeId === depRoad.endNodeId ? 1 : 0,
    sectionId: depStation.roadSectionId,
  });

  // Middle spans: one per road entered by an RSC (all except the last).
  for (let k = 0; k < rsesBetween.length - 1; k++) {
    const rsc     = rsesBetween[k];
    const nextRsc = rsesBetween[k + 1];
    if (!rsc.entering) return spans;
    const road = findRoadForSection(rsc.entering, state);
    if (!road) return spans;
    spans.push({
      road,
      tEntry: rsc.nodeId === road.startNodeId ? 0 : 1,
      tExit:  nextRsc.nodeId === road.endNodeId ? 1 : 0,
      sectionId: rsc.entering,
    });
  }

  // Last span: last junction node → arrival station.
  const lastRsc  = rsesBetween[rsesBetween.length - 1];
  if (!lastRsc.entering) return spans;
  const lastRoad = findRoadForSection(lastRsc.entering, state);
  if (!lastRoad) return spans;
  spans.push({
    road: lastRoad,
    tEntry: lastRsc.nodeId === lastRoad.startNodeId ? 0 : 1,
    tExit: arrStation.interpT,
    sectionId: arrStation.roadSectionId,
  });

  return spans;
}

// Returns stations on a road whose interpT lies strictly inside (tEntry, tExit),
// sorted in travel order, excluding any already in stoppingIds.
// When sectionId is provided, only stations belonging to that section are considered.
function findIntermediateStations(
  road: Road, tEntry: number, tExit: number,
  stoppingIds: Set<StationId>, state: Readonly<MapState>,
  sectionId: RoadSectionId | null,
): Station[] {
  const tMin = Math.min(tEntry, tExit);
  const tMax = Math.max(tEntry, tExit);
  const section = sectionId ? road.sections.get(sectionId) : null;
  const stationIds = section
    ? section.stationIds
    : [...road.sections.values()].flatMap(s => s.stationIds);
  return stationIds
    .filter(id => !stoppingIds.has(id))
    .map(id => state.stations.get(id))
    .filter((st): st is Station => st != null && st.interpT > tMin && st.interpT < tMax)
    .sort((a, b) => tEntry <= tExit ? a.interpT - b.interpT : b.interpT - a.interpT);
}

// Inserts stops:false entries for every station a line passes through without stopping.
// Pass-throughs are interleaved with the RSEs they belong between so that
// getLineDirectionAtStop can infer direction from the preceding RSE.
function insertPassThroughStops(paths: LinePath[], state: Readonly<MapState>): LinePath[] {
  const result: LinePath[] = [];
  let i = 0;

  // excludeIds contains only the two endpoints of the current segment (dep + arr).
  // Stations that are explicit stops elsewhere in the path are still eligible to appear
  // as pass-throughs here (e.g. B in A→B→C→B→A→C, where A→C passes through B).
  const pushPassThroughs = (span: RoadSpan, rank: number, excludeIds: Set<StationId>) => {
    for (const st of findIntermediateStations(span.road, span.tEntry, span.tExit, excludeIds, state, span.sectionId)) {
      result.push({ kind: 'station-stop', index: 0, stationId: st.id, rank, stops: false });
    }
  };

  while (i < paths.length) {
    const p = paths[i];

    if (p.kind !== 'station-stop') { result.push(p); i++; continue; }

    // Collect the RSEs between this stop and the next stop.
    let j = i + 1;
    const rsesBetween: RoadSectionChange[] = [];
    while (j < paths.length && paths[j].kind === 'road-section-change') {
      rsesBetween.push(paths[j] as RoadSectionChange);
      j++;
    }
    const nextStop = (j < paths.length && paths[j].kind === 'station-stop')
      ? paths[j] as StationStop : null;

    result.push(p);

    if (!nextStop) { i++; continue; }

    const depStation = state.stations.get(p.stationId);
    const arrStation = state.stations.get(nextStop.stationId);
    const spans = (depStation && arrStation)
      ? getRoadSpans(depStation, arrStation, rsesBetween, state) : [];

    // spans must be exactly rsesBetween.length + 1; otherwise skip.
    if (spans.length !== rsesBetween.length + 1) { i++; continue; }

    // Interleave pass-throughs with RSEs: spans[0] before rse[0], spans[k+1] after rse[k].
    const segmentExclude = new Set<StationId>([p.stationId, nextStop.stationId]);
    pushPassThroughs(spans[0], p.rank, segmentExclude);
    for (let k = 0; k < rsesBetween.length; k++) {
      result.push(rsesBetween[k]);
      pushPassThroughs(spans[k + 1], p.rank, segmentExclude);
    }
    i = j; // arr stop is processed next iteration
  }

  return result.map((p, idx) => ({ ...p, index: idx }));
}

// ── Main validator ────────────────────────────────────────────────────────────

function tryAutoInsertRSC(
  prevStop: StationStop, currStop: StationStop, state: Readonly<MapState>,
): RoadSectionChange | null {
  const prevStation = state.stations.get(prevStop.stationId);
  const currStation = state.stations.get(currStop.stationId);
  if (!prevStation || !currStation) return null;
  const prevRoad = findRoadForStation(prevStation, state);
  const currRoad = findRoadForStation(currStation, state);
  if (!prevRoad || !currRoad || prevRoad.id === currRoad.id) return null;
  const nodeId = findSharedNode(prevRoad, currRoad);
  if (!nodeId) return null;
  // Use the station stop ranks as junction ranks so that multiple lines passing
  // through the same junction automatically land on distinct lateral slots.
  return { kind: 'road-section-change', index: 0, nodeId, exiting: prevStation.roadSectionId, entering: currStation.roadSectionId, exitRank: prevStop.rank, enterRank: currStop.rank };
}

// Validates and normalises RSE entries for a line:
// - Preserves manually-placed RSEs between consecutive stops (multi-hop support).
// - Auto-inserts a single RSE between consecutive stops on different directly-connected
//   roads when no RSE is already present between them.
// - Strips leading RSEs (before the first stop) and trailing RSEs (after the last stop).
// - Inserts stops:false entries for every station the line passes through without stopping.
export function validateLinePaths(line: Line, state: Readonly<MapState>): LinePath[] {
  const result: LinePath[] = [];
  let prevStopResultIdx = -1;

  for (const p of line.paths) {
    // Pass-through entries are always recomputed below; discard any existing ones.
    if (p.kind === 'station-stop' && !p.stops) continue;

    if (p.kind === 'road-section-change') {
      if (prevStopResultIdx >= 0) result.push(p);
    } else {
      if (prevStopResultIdx >= 0 && result.length === prevStopResultIdx + 1) {
        const rsc = tryAutoInsertRSC(result[prevStopResultIdx] as StationStop, p, state);
        if (rsc) result.push(rsc);
      }
      prevStopResultIdx = result.length;
      result.push(p);
    }
  }

  while (result.length > 0 && result[result.length - 1].kind !== 'station-stop') result.pop();

  const reindexed = result.map((p, i) => ({ ...p, index: i }));
  return insertPassThroughStops(reindexed, state);
}
