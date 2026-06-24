import { Line, LinePath, Road, RoadSection, RoadSectionChange, Station, StationStop } from "../models/structures";
import { Node } from "../models/structures";

function findRoadForStation(station: Station): Road | null {
  return station.roadSection?.road ?? null;
}

function findSharedNode(roadA: Road, roadB: Road): Node | null {
  if (roadA.endNode === roadB.startNode || roadA.endNode === roadB.endNode) return roadA.endNode;
  if (roadA.startNode === roadB.startNode || roadA.startNode === roadB.endNode) return roadA.startNode;
  return null;
}

// ── Pass-through helpers ──────────────────────────────────────────────────────

type RoadSpan = { road: Road; tEntry: number; tExit: number; section: RoadSection | null };

// Decomposes a segment (dep → arr, with the RSEs between them) into a sequence of
// road spans, each with the entry and exit interpT values on that road.
function getRoadSpans(
  depStation: Station,
  arrStation: Station,
  rsesBetween: RoadSectionChange[],
): RoadSpan[] {
  const depRoad = findRoadForStation(depStation);
  const arrRoad = findRoadForStation(arrStation);
  if (!depRoad || !arrRoad) return [];

  if (rsesBetween.length === 0) {
    if (depRoad !== arrRoad) return [];
    return [{ road: depRoad, tEntry: depStation.interpT, tExit: arrStation.interpT, section: depStation.roadSection }];
  }

  const spans: RoadSpan[] = [];

  // First span: departure station → first junction node.
  const firstRsc = rsesBetween[0];
  spans.push({
    road: depRoad,
    tEntry: depStation.interpT,
    tExit: firstRsc.node === depRoad.endNode ? 1 : 0,
    section: depStation.roadSection,
  });

  // Middle spans: one per road entered by an RSC (all except the last).
  for (let k = 0; k < rsesBetween.length - 1; k++) {
    const rsc     = rsesBetween[k];
    const nextRsc = rsesBetween[k + 1];
    if (!rsc.entering) return spans;
    const road = rsc.entering.road;
    spans.push({
      road,
      tEntry: rsc.node === road.startNode ? 0 : 1,
      tExit:  nextRsc.node === road.endNode ? 1 : 0,
      section: rsc.entering,
    });
  }

  // Last span: last junction node → arrival station.
  const lastRsc = rsesBetween[rsesBetween.length - 1];
  if (!lastRsc.entering) return spans;
  const lastRoad = lastRsc.entering.road;
  spans.push({
    road: lastRoad,
    tEntry: lastRsc.node === lastRoad.startNode ? 0 : 1,
    tExit: arrStation.interpT,
    section: arrStation.roadSection,
  });

  return spans;
}

// Returns stations on a road whose interpT lies strictly inside (tEntry, tExit),
// sorted in travel order, excluding any already in stoppingSet.
function findIntermediateStations(
  road: Road, tEntry: number, tExit: number,
  stoppingSet: Set<Station>,
  section: RoadSection | null,
): Station[] {
  const tMin = Math.min(tEntry, tExit);
  const tMax = Math.max(tEntry, tExit);
  const candidates = section
    ? section.stations
    : [...road.sections.values()].flatMap(s => s.stations);
  return candidates
    .filter(st => !stoppingSet.has(st) && st.interpT > tMin && st.interpT < tMax)
    .sort((a, b) => tEntry <= tExit ? a.interpT - b.interpT : b.interpT - a.interpT);
}

// Inserts stops:false entries for every station a line passes through without stopping.
function insertPassThroughStops(paths: LinePath[]): LinePath[] {
  const result: LinePath[] = [];
  let i = 0;

  const pushPassThroughs = (span: RoadSpan, rank: number, stoppingSet: Set<Station>) => {
    for (const st of findIntermediateStations(span.road, span.tEntry, span.tExit, stoppingSet, span.section)) {
      result.push({ kind: 'station-stop', index: 0, station: st, rank, stops: false });
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

    const depStation = p.station;
    const arrStation = nextStop.station;
    const spans = getRoadSpans(depStation, arrStation, rsesBetween);

    if (spans.length !== rsesBetween.length + 1) { i++; continue; }

    const segmentExclude = new Set<Station>([depStation, arrStation]);
    pushPassThroughs(spans[0], p.rank, segmentExclude);
    for (let k = 0; k < rsesBetween.length; k++) {
      result.push(rsesBetween[k]);
      pushPassThroughs(spans[k + 1], p.rank, segmentExclude);
    }
    i = j;
  }

  return result.map((p, idx) => ({ ...p, index: idx }));
}

// ── Main validator ────────────────────────────────────────────────────────────

function tryAutoInsertRSC(
  prevStop: StationStop, currStop: StationStop,
): RoadSectionChange | null {
  const prevStation = prevStop.station;
  const currStation = currStop.station;
  const prevRoad = findRoadForStation(prevStation);
  const currRoad = findRoadForStation(currStation);
  if (!prevRoad || !currRoad || prevRoad === currRoad) return null;
  const node = findSharedNode(prevRoad, currRoad);
  if (!node) return null;
  return {
    kind: 'road-section-change',
    index: 0,
    node,
    exiting: prevStation.roadSection,
    entering: currStation.roadSection,
    exitRank: prevStop.rank,
    enterRank: currStop.rank,
  };
}

export function validateLinePaths(line: Line): LinePath[] {
  const result: LinePath[] = [];
  let prevStopResultIdx = -1;

  for (const p of line.paths) {
    if (p.kind === 'station-stop' && !p.stops) continue;

    if (p.kind === 'road-section-change') {
      if (prevStopResultIdx >= 0) result.push(p);
    } else {
      if (prevStopResultIdx >= 0 && result.length === prevStopResultIdx + 1) {
        const rsc = tryAutoInsertRSC(result[prevStopResultIdx] as StationStop, p);
        if (rsc) result.push(rsc);
      }
      prevStopResultIdx = result.length;
      result.push(p);
    }
  }

  while (result.length > 0 && result[result.length - 1].kind !== 'station-stop') result.pop();

  const reindexed = result.map((p, i) => ({ ...p, index: i }));
  return insertPassThroughStops(reindexed);
}
