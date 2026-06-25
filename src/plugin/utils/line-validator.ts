import { Line, LinePath, Road, RoadSection, RoadSectionChange, Station, StationStop } from "../models/structures";
import { own, Owned } from "@/common/utils/ownership";


// ── Pass-through helpers ──────────────────────────────────────────────────────

type RoadSpan = { road: Road; tEntry: number; tExit: number; section: RoadSection | null };

// Decomposes a segment (dep → arr, with the RSEs between them) into a sequence of
// road spans, each with the entry and exit interpT values on that road.
function getRoadSpans(
  depStation: Station,
  arrStation: Station,
  rsesBetween: RoadSectionChange[],
): RoadSpan[] {
  const depRoad = depStation.parentRoadSection.parentRoad;
  const arrRoad = arrStation.parentRoadSection.parentRoad;

  if (rsesBetween.length === 0) {
    if (depRoad !== arrRoad) return [];
    return [{ road: depRoad, tEntry: depStation.interpT, tExit: arrStation.interpT, section: depStation.parentRoadSection }];
  }

  const spans: RoadSpan[] = [];

  // First span: departure station → first junction node.
  const firstRsc = rsesBetween[0];
  spans.push({
    road: depRoad,
    tEntry: depStation.interpT,
    tExit: firstRsc.node === depRoad.endpoints[1].node ? 1 : 0,
    section: depStation.parentRoadSection,
  });

  // Middle spans: one per road entered by an RSC (all except the last).
  for (let k = 0; k < rsesBetween.length - 1; k++) {
    const rsc     = rsesBetween[k];
    const nextRsc = rsesBetween[k + 1];
    if (!rsc.entering) return spans;
    const road = rsc.entering.section.parentRoad;
    spans.push({
      road,
      tEntry: rsc.node === road.endpoints[0].node ? 0 : 1,
      tExit:  nextRsc.node === road.endpoints[1].node ? 1 : 0,
      section: rsc.entering.section,
    });
  }

  // Last span: last junction node → arrival station.
  const lastRsc = rsesBetween[rsesBetween.length - 1];
  if (!lastRsc.entering) return spans;
  const lastRoad = lastRsc.entering.section.parentRoad;
  spans.push({
    road: lastRoad,
    tEntry: lastRsc.node === lastRoad.endpoints[0].node ? 0 : 1,
    tExit: arrStation.interpT,
    section: arrStation.parentRoadSection,
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
    : [...road.getSections()].flatMap(s => s.stations);
  return candidates
    .filter(st => !stoppingSet.has(st) && st.interpT > tMin && st.interpT < tMax)
    .sort((a, b) => tEntry <= tExit ? a.interpT - b.interpT : b.interpT - a.interpT);
}

// Inserts stops:false entries for every station a line passes through without stopping.
function insertPassThroughStops(paths: Owned<LinePath>[]): Owned<LinePath>[] {
  const result: Owned<LinePath>[] = [];
  let i = 0;

  const pushPassThroughs = (span: RoadSpan, rank: number, stoppingSet: Set<Station>) => {
    const direction: 'ascending' | 'descending' = span.tEntry <= span.tExit ? 'ascending' : 'descending';
    for (const st of findIntermediateStations(span.road, span.tEntry, span.tExit, stoppingSet, span.section)) {
      result.push(st.makePassThroughStop(rank, direction));
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
      result.push(own(rsesBetween[k]));
      pushPassThroughs(spans[k + 1], p.rank, segmentExclude);
    }
    i = j;
  }

  result.forEach((p, idx) => { p.index = idx; });
  return result;
}

// ── Main validator ────────────────────────────────────────────────────────────

export function validateLinePaths(line: Line): Owned<LinePath>[] {
  const result: Owned<LinePath>[] = [];
  let prevStopResultIdx = -1;

  for (const p of line.paths) {
    if (p.kind === 'station-stop' && !p.stops) continue;

    if (p.kind === 'road-section-change') {
      if (prevStopResultIdx >= 0) result.push(p);
    } else {
      if (prevStopResultIdx >= 0 && result.length === prevStopResultIdx + 1) {
        const rsc = (result[prevStopResultIdx] as StationStop).autoInsertRSCTo(p);
        if (rsc) result.push(rsc);
      }
      prevStopResultIdx = result.length;
      result.push(p);
    }
  }

  while (result.length > 0 && result[result.length - 1].kind !== 'station-stop') result.pop();

  result.forEach((p, i) => { p.index = i; });
  return insertPassThroughStops(result);
}
