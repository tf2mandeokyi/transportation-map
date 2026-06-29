import { Line, LinePath, RoadSectionChange, Station, StationStop } from "../models/structures";
import { Owned } from "@/common/utils/ownership";
import { RoadSectionPos } from "../models/structures/line-path";

// Returns stations on `section` that lie strictly between from and to (in travel order),
// excluding any station in `exclude`.
function fillBetween(
  from: RoadSectionPos,
  to: RoadSectionPos,
  rank: number,
  exclude: Set<Station>,
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
    .map(st => st.makePassThroughStop(rank, dir));
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
): Owned<LinePath>[] {
  if (from.section === to.section) {
    const exclude = new Set<Station>([
      ...(prevStop ? [prevStop.station] : []),
      ...(nextStop ? [nextStop.station] : []),
    ]);
    return fillBetween(from, to, rank, exclude);
  }

  // Different sections: try to auto-insert an RSC between the two stops
  if (!prevStop || !nextStop) return [];
  const rsc = prevStop.autoInsertRSCTo(nextStop);
  if (!rsc) return [];

  const result: Owned<LinePath>[] = [];
  const rscStart = rsc.start();
  const rscEnd   = rsc.end();

  if (rscStart?.section === from.section) {
    result.push(...fillBetween(from, rscStart, rank, new Set([prevStop.station])));
  }
  result.push(rsc);
  if (rscEnd?.section === to.section) {
    result.push(...fillBetween(rscEnd, to, rsc.enterRank, new Set([nextStop.station])));
  }
  return result;
}

export function validateLinePaths(line: Line): Owned<LinePath>[] {
  // Strip stale pass-throughs left over from a previous validation run
  const inputPaths = line.paths.filter(p => !(p instanceof StationStop) || p.stops);

  // The first stop has no prior currentPos to derive direction from, so it keeps whatever
  // direction it had when it was created ('ascending' by default). If it's immediately followed
  // on the same section by another stop (no RSC between), fix its direction now — otherwise
  // buildDisplayEntries sees a direction reversal and inserts a spurious virtual U-turn.
  const firstStopIdx = inputPaths.findIndex(p => p instanceof StationStop);
  if (firstStopIdx >= 0 && firstStopIdx + 1 < inputPaths.length) {
    const first = inputPaths[firstStopIdx] as LinePath as StationStop;
    const after = inputPaths[firstStopIdx + 1];
    if (after instanceof StationStop && after.station.parentRoadSection === first.station.parentRoadSection) {
      const cmp = first.station.interpT.compare(after.station.interpT);
      if (cmp !== 0) first.direction = cmp < 0 ? 'ascending' : 'descending';
    }
  }

  let currentPos: RoadSectionPos | undefined;
  let prevStop: StationStop | null = null;
  const result: Owned<LinePath>[] = [];

  for (const path of inputPaths) {
    if (path instanceof StationStop) {
      // Direction must be set before calling start()/end(), since those use it for bias.
      if (currentPos) {
        const cmp = currentPos.offset.compare(path.station.interpT);
        path.direction = cmp < 0 ? 'ascending' : 'descending';
      }

      const pathStart = path.start();
      if (currentPos && pathStart) {
        const rank = prevStop?.rank ?? path.rank;
        for (const fill of fillInMissingPaths(currentPos, pathStart, rank, prevStop, path)) {
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
        for (const fill of fillBetween(currentPos, pathStart, rank, exclude)) {
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
