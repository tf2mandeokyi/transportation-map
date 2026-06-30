import { Line, LinePath, RoadSection, RoadSectionChange, Station, StationStop } from "../models/structures";
import { Owned } from "@/common/utils/ownership";
import { RoadSectionPos } from "../models/structures/line-path";

// Returns stations on `section` that lie strictly between from and to (in travel order),
// excluding any station in `exclude`.
function fillBetween(
  from: RoadSectionPos,
  to: RoadSectionPos,
  rank: number,
  exclude: Set<Station>,
  savedPassRanks?: Map<string, number>,
): Owned<StationStop>[] {
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

// Fills missing entries between currentPos and path.start():
//   - pass-through stops when on the same section
//   - auto-inserted RSC + surrounding pass-throughs when sections differ
function fillInMissingPaths(
  from: RoadSectionPos,
  to: RoadSectionPos,
  rank: number,
  prevStop: StationStop | null,
  nextStop: StationStop | null,
  savedPassRanks?: Map<string, number>,
): Owned<LinePath>[] {
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

  const result: Owned<LinePath>[] = [];
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

// Returns the next StationStop on the same section, stopping at any RSC or any stop
// on a different section. Used to determine a stop's direction from what comes after it
// rather than what came before — which correctly handles virtual U-turn bottom stops.
function findNextStopOnSameSection(
  paths: LinePath[],
  fromIdx: number,
  section: RoadSection,
): StationStop | null {
  for (let i = fromIdx; i < paths.length; i++) {
    const p = paths[i];
    if (p instanceof RoadSectionChange) return null;
    if (p instanceof StationStop) {
      return p.station.parentRoadSection === section ? p : null;
    }
  }
  return null;
}

export function validateLinePaths(line: Line): Owned<LinePath>[] {
  // Preserve ranks of existing pass-throughs so round-trips remain stable.
  // Key: "stationId:direction" — if a pass-through for the same station+direction
  // is re-inserted, it gets its previously-normalized rank back instead of
  // inheriting the adjacent real stop's rank (which may have shifted).
  const savedPassRanks = new Map<string, number>();
  for (const p of line.paths) {
    if (p instanceof StationStop && !p.stops) {
      savedPassRanks.set(`${p.station.id}:${p.direction}`, p.rank);
    }
  }

  // Strip stale pass-throughs left over from a previous validation run
  const inputPaths = line.paths.filter(p => !(p instanceof StationStop) || p.stops);

  let currentPos: RoadSectionPos | undefined;
  let prevStop: StationStop | null = null;
  const result: Owned<LinePath>[] = [];

  for (let i = 0; i < inputPaths.length; i++) {
    const path = inputPaths[i];
    if (path instanceof StationStop) {
      // Direction must be set before calling start()/end(), since those use it for bias.
      // Prefer looking AHEAD to the next stop on the same section: the stop's direction
      // should represent where the line goes AFTER it (the departing direction). This
      // correctly handles virtual U-turn bottom stops, which are reached descending but
      // depart ascending. Fall back to the incoming-position approach only when no
      // forward stop on the same section exists.
      const nextStop = findNextStopOnSameSection(inputPaths, i + 1, path.station.parentRoadSection);
      if (nextStop) {
        const cmp = path.station.interpT.compare(nextStop.station.interpT);
        if (cmp !== 0) path.direction = cmp < 0 ? 'ascending' : 'descending';
      } else if (currentPos) {
        const cmp = currentPos.offset.compare(path.station.interpT);
        path.direction = cmp < 0 ? 'ascending' : 'descending';
      }
      // else: first stop with no lookahead — keep the stored/default direction.

      const pathStart = path.start();
      if (currentPos && pathStart) {
        const rank = prevStop?.rank ?? path.rank;
        for (const fill of fillInMissingPaths(currentPos, pathStart, rank, prevStop, path, savedPassRanks)) {
          result.push(fill);
        }
      }

      result.push(path);
      currentPos = path.end();
      prevStop = path;

    } else if (path instanceof RoadSectionChange) {
      const pathStart = path.start();
      if (currentPos && currentPos.section === pathStart?.section) {
        const rank = prevStop?.rank ?? 0;
        const exclude = new Set<Station>(prevStop ? [prevStop.station] : []);
        for (const fill of fillBetween(currentPos, pathStart, rank, exclude, savedPassRanks)) {
          result.push(fill);
        }
      }

      result.push(path);
      currentPos = path.end();
    }
  }

  // Drop trailing RSCs — a valid path ends on a stop
  while (result.length > 0 && !(result[result.length - 1] instanceof StationStop)) result.pop();

  result.forEach((p, i) => { p.index = i; });
  return result;
}
