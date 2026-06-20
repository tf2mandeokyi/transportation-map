import { Line, LinePath, MapState, Road, RoadSectionEnter, Station, StationStop } from "../models/structures";
import { NodeId, StationId } from "@/common/types";
import { findRoadForSection } from "./section";

function findSharedNode(roadA: Road, roadB: Road): NodeId | null {
  if (roadA.endNodeId === roadB.startNodeId || roadA.endNodeId === roadB.endNodeId) return roadA.endNodeId;
  if (roadA.startNodeId === roadB.startNodeId || roadA.startNodeId === roadB.endNodeId) return roadA.startNodeId;
  return null;
}

// ── Pass-through helpers ──────────────────────────────────────────────────────

type RoadSpan = { road: Road; tEntry: number; tExit: number };

// Decomposes a segment (dep → arr, with the RSEs between them) into a sequence of
// road spans, each with the entry and exit interpT values on that road.
// Always returns exactly rsesBetween.length + 1 spans, or fewer if data is missing.
function getRoadSpans(
  depStation: Station,
  arrStation: Station,
  rsesBetween: RoadSectionEnter[],
  state: Readonly<MapState>,
): RoadSpan[] {
  const depRoad = depStation.roadSectionId ? findRoadForSection(depStation.roadSectionId, state) : null;
  const arrRoad = arrStation.roadSectionId ? findRoadForSection(arrStation.roadSectionId, state) : null;
  if (!depRoad || !arrRoad) return [];

  if (rsesBetween.length === 0) {
    if (depRoad.id !== arrRoad.id) return [];
    return [{ road: depRoad, tEntry: depStation.interpT, tExit: arrStation.interpT }];
  }

  const spans: RoadSpan[] = [];

  // First span: departure station → first junction node.
  const firstRse = rsesBetween[0];
  spans.push({
    road: depRoad,
    tEntry: depStation.interpT,
    tExit: firstRse.nodeId === depRoad.endNodeId ? 1 : 0,
  });

  // Middle spans: one per road entered by an RSE (all except the last).
  for (let k = 0; k < rsesBetween.length - 1; k++) {
    const rse     = rsesBetween[k];
    const nextRse = rsesBetween[k + 1];
    const road = state.roads.get(rse.destRoadId);
    if (!road) return spans; // incomplete — caller will skip pass-through insertion
    spans.push({
      road,
      tEntry: rse.nodeId === road.startNodeId ? 0 : 1,
      tExit:  nextRse.nodeId === road.endNodeId ? 1 : 0,
    });
  }

  // Last span: last junction node → arrival station.
  const lastRse  = rsesBetween[rsesBetween.length - 1];
  const lastRoad = state.roads.get(lastRse.destRoadId);
  if (!lastRoad) return spans;
  spans.push({
    road: lastRoad,
    tEntry: lastRse.nodeId === lastRoad.startNodeId ? 0 : 1,
    tExit: arrStation.interpT,
  });

  return spans;
}

// Returns stations on a road whose interpT lies strictly inside (tEntry, tExit),
// sorted in travel order, excluding any already in stoppingIds.
function findIntermediateStations(
  road: Road, tEntry: number, tExit: number,
  stoppingIds: Set<StationId>, state: Readonly<MapState>,
): Station[] {
  const tMin = Math.min(tEntry, tExit);
  const tMax = Math.max(tEntry, tExit);
  const result: Station[] = [];
  for (const section of road.sections.values()) {
    for (const stationId of section.stationIds) {
      if (stoppingIds.has(stationId)) continue;
      const st = state.stations.get(stationId);
      if (st && st.interpT > tMin && st.interpT < tMax) result.push(st);
    }
  }
  result.sort((a, b) => tEntry <= tExit ? a.interpT - b.interpT : b.interpT - a.interpT);
  return result;
}

// Inserts stops:false entries for every station a line passes through without stopping.
// Pass-throughs are interleaved with the RSEs they belong between so that
// getLineDirectionAtStop can infer direction from the preceding RSE.
function insertPassThroughStops(paths: LinePath[], state: Readonly<MapState>): LinePath[] {
  const stoppingIds = new Set(
    paths.filter((p): p is StationStop => p.kind === 'station-stop').map(p => p.stationId)
  );

  const result: LinePath[] = [];
  let i = 0;

  const pushPassThroughs = (span: RoadSpan, rank: number) => {
    for (const st of findIntermediateStations(span.road, span.tEntry, span.tExit, stoppingIds, state)) {
      result.push({ kind: 'station-stop', index: 0, stationId: st.id, rank, stops: false });
    }
  };

  while (i < paths.length) {
    const p = paths[i];

    if (p.kind !== 'station-stop') { result.push(p); i++; continue; }

    // Collect the RSEs between this stop and the next stop.
    let j = i + 1;
    const rsesBetween: RoadSectionEnter[] = [];
    while (j < paths.length && paths[j].kind === 'road-section-enter') {
      rsesBetween.push(paths[j] as RoadSectionEnter);
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

    if (rsesBetween.length === 0) {
      // Same road: all pass-throughs follow the departure stop directly.
      pushPassThroughs(spans[0], p.rank);
      i++;
    } else {
      // Multi-road: interleave pass-throughs with RSEs so each pass-through sits
      // between the RSE entering its road and the RSE leaving it. This lets
      // getLineDirectionAtStop read direction from the preceding RSE.
      pushPassThroughs(spans[0], p.rank);
      for (let k = 0; k < rsesBetween.length - 1; k++) {
        result.push(rsesBetween[k]);
        pushPassThroughs(spans[k + 1], p.rank);
      }
      result.push(rsesBetween[rsesBetween.length - 1]);
      pushPassThroughs(spans[spans.length - 1], p.rank);
      i = j; // arr stop is processed next iteration
    }
  }

  return result.map((p, idx) => ({ ...p, index: idx }));
}

// ── Main validator ────────────────────────────────────────────────────────────

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

    if (p.kind === 'road-section-enter') {
      if (prevStopResultIdx >= 0) result.push(p);
    } else {
      if (prevStopResultIdx >= 0 && result.length === prevStopResultIdx + 1) {
        const prevStop    = result[prevStopResultIdx] as StationStop;
        const prevStation = state.stations.get(prevStop.stationId);
        const currStation = state.stations.get(p.stationId);
        if (prevStation && currStation) {
          const prevRoad = prevStation.roadSectionId ? findRoadForSection(prevStation.roadSectionId, state) : null;
          const currRoad = currStation.roadSectionId ? findRoadForSection(currStation.roadSectionId, state) : null;
          if (prevRoad && currRoad && prevRoad.id !== currRoad.id) {
            const nodeId = findSharedNode(prevRoad, currRoad);
            if (nodeId) {
              result.push({ kind: 'road-section-enter', index: 0, sourceRoadId: prevRoad.id, nodeId, destRoadId: currRoad.id });
            }
          }
        }
      }
      prevStopResultIdx = result.length;
      result.push(p);
    }
  }

  while (result.length > 0 && result[result.length - 1].kind !== 'station-stop') result.pop();

  const reindexed = result.map((p, i) => ({ ...p, index: i }));
  return insertPassThroughStops(reindexed, state);
}
