import { Line, RoadSectionChange, Station, StationStop } from "../models/structures";
import { Owned, own } from "@/common/utils/ownership";
import { LinePath, RoadSectionPos } from "../models/structures/line-path";

// Returns stations on `section` that lie strictly between from and to (in travel order),
// excluding any station in `exclude`.
function fillBetween(
  from: RoadSectionPos,
  to: RoadSectionPos,
  rank: number,
  exclude: Set<Station>,
  savedPassRanks?: Map<string, number>,
): StationStop[] {
  if (from.section !== to.section) return [];
  const ascending = from.offset.compare(to.offset) < 0;
  const dir: 'ascending' | 'descending' = ascending ? 'ascending' : 'descending';
  return from.section.stations
    .filter(st => {
      if (exclude.has(st)) return false;
      // Station is strictly between from and to using bias-aware comparison.
      return ascending
        ? from.offset.compare(st.interpT) < 0 && st.interpT.compare(to.offset) < 0
        : from.offset.compare(st.interpT) > 0 && st.interpT.compare(to.offset) > 0;
    })
    .sort((a, b) => ascending ? a.interpT.compare(b.interpT) : b.interpT.compare(a.interpT))
    .map(st => st.makePassThroughStop(savedPassRanks?.get(`${st.id}:${dir}`) ?? rank, dir));
}

// Fills missing entries between currentPos and stop.start():
//   - pass-through stops when on the same section
//   - auto-inserted RSC + surrounding pass-throughs when sections differ
function fillInMissingPaths(
  from: RoadSectionPos,
  to: RoadSectionPos,
  rank: number,
  prevStop: StationStop | null,
  nextStop: StationStop | null,
  savedPassRanks?: Map<string, number>,
): (RoadSectionChange | StationStop)[] {
  if (from.section === to.section) {
    const exclude = new Set<Station>([
      ...(prevStop ? [prevStop.station] : []),
      ...(nextStop ? [nextStop.station] : []),
    ]);
    return fillBetween(from, to, rank, exclude, savedPassRanks);
  }

  // Different sections: try to auto-insert an RSC between the two stops
  if (!prevStop || !nextStop) return [];
  const rsc = prevStop.autoInsertRSCTo(nextStop);
  if (!rsc) return [];

  const result: (RoadSectionChange | StationStop)[] = [];
  const rscStart = rsc.start();
  const rscEnd   = rsc.end();

  if (rscStart?.section === from.section) {
    result.push(...fillBetween(from, rscStart, rank, new Set([prevStop.station]), savedPassRanks));
  }
  result.push(rsc);
  if (rscEnd?.section === to.section) {
    result.push(...fillBetween(rscEnd, to, rsc.enterRank, new Set([nextStop.station]), savedPassRanks));
  }
  return result;
}

// Returns the next non-stale stop within the same group, for direction inference.
// A group boundary always means either an RSC or the end of the path, both of which
// should be treated the same as "no forward stop" (findNextStopOnSameSection's old
// cross-group behavior), so this never needs to look past the current group.
function findNextStopInGroup(stops: readonly StationStop[], fromIdx: number): StationStop | null {
  for (let i = fromIdx; i < stops.length; i++) {
    if (stops[i].stops) return stops[i];
  }
  return null;
}

export function validateLinePaths(line: Line): Owned<LinePath>[] {
  // Preserve ranks of existing pass-throughs so round-trips remain stable.
  // Key: "stationId:direction" — if a pass-through for the same station+direction
  // is re-inserted, it gets its previously-normalized rank back instead of
  // inheriting the adjacent real stop's rank (which may have shifted).
  const savedPassRanks = new Map<string, number>();
  for (const group of line.paths) {
    for (const stop of group.stationStops) {
      if (!stop.stops) savedPassRanks.set(`${stop.station.id}:${stop.direction}`, stop.rank);
    }
  }

  // Builds the validated result incrementally, grouping as it goes: an RSC
  // always starts a new group, and any stop before the first RSC (or with no
  // RSC yet) accumulates into a leading bare group.
  const result: LinePath[] = [];
  let currentOutGroup: LinePath | null = null;
  const pushRsc = (rsc: RoadSectionChange): void => {
    currentOutGroup = new LinePath();
    currentOutGroup.fromRoadSectionChange = rsc;
    result.push(currentOutGroup);
  };
  const pushStop = (stop: StationStop): void => {
    if (!currentOutGroup) {
      currentOutGroup = new LinePath();
      result.push(currentOutGroup);
    }
    currentOutGroup.stationStops.push(stop);
  };
  const pushEntry = (entry: RoadSectionChange | StationStop): void => {
    if (entry instanceof RoadSectionChange) pushRsc(entry);
    else pushStop(entry);
  };

  let currentPos: RoadSectionPos | undefined;
  let prevStop: StationStop | null = null;

  for (const group of line.paths) {
    if (group.fromRoadSectionChange) {
      const rsc = group.fromRoadSectionChange;
      const rscStart = rsc.start();
      if (currentPos && currentPos.section === rscStart?.section) {
        const rank = prevStop?.rank ?? 0;
        const exclude = new Set<Station>(prevStop ? [prevStop.station] : []);
        for (const fill of fillBetween(currentPos, rscStart, rank, exclude, savedPassRanks)) {
          pushStop(fill);
        }
      }
      pushRsc(rsc);
      currentPos = rsc.end();
    }

    const stops = group.stationStops;
    for (let i = 0; i < stops.length; i++) {
      const stop = stops[i];
      if (!stop.stops) continue; // strip stale pass-throughs left over from a previous validation run

      // Direction must be set before calling start()/end(), since those use it for bias.
      // Prefer looking AHEAD to the next stop on the same section: the stop's direction
      // should represent where the line goes AFTER it (the departing direction). This
      // correctly handles virtual U-turn bottom stops, which are reached descending but
      // depart ascending. Fall back to the incoming-position approach only when no
      // forward stop on the same section exists.
      const nextStop = findNextStopInGroup(stops, i + 1);
      if (nextStop) {
        const cmp = stop.station.interpT.compare(nextStop.station.interpT);
        if (cmp !== 0) stop.direction = cmp < 0 ? 'ascending' : 'descending';
      } else if (currentPos) {
        const cmp = currentPos.offset.compare(stop.station.interpT);
        stop.direction = cmp < 0 ? 'ascending' : 'descending';
      }
      // else: first stop with no lookahead — keep the stored/default direction.

      const stopStart = stop.start();
      if (currentPos && stopStart) {
        const rank = prevStop?.rank ?? stop.rank;
        for (const fill of fillInMissingPaths(currentPos, stopStart, rank, prevStop, stop, savedPassRanks)) {
          pushEntry(fill);
        }
      }

      pushStop(stop);
      currentPos = stop.end();
      prevStop = stop;
    }
  }

  // Drop trailing RSC-only groups — a valid path ends on a stop.
  while (result.length > 0 && result[result.length - 1].stationStops.length === 0) result.pop();

  return result.map(group => own(group));
}
