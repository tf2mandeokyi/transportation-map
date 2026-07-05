import { Line, RoadSectionChange, StationStop } from "../models/structures";
import { Owned, own } from "@/common/utils/ownership";
import { LinePath, RoadSectionPos } from "../models/structures/line-path";
import { OffsetT } from "./offset-t";

// Returns pass-through stops for every station on `from.section` that lies strictly
// between `from` and `to` (in travel order implied by `from.compare(to)`).
//
// `from` carries a directional bias (it's always some stop's biased start()/end(), or
// a junction-crossing offset), while `to` is always a station's raw (zero-bias) offset.
// That asymmetry is deliberate: when the line reverses direction right at a station —
// a virtual U-turn — `from` is biased to the side the line just departed on, but the
// station's own raw offset sits exactly at that value with no bias. The bias-aware
// `compare()` then treats the raw offset as lying just on the "before" side of `from`,
// so that same station is picked up again here as a passing stop for the new direction.
// This is how a U-turn's turnaround station ends up duplicated (once as the real stop,
// once as a pass-through immediately after) without any special-cased pivot detection.
function fillBetween(
  from: RoadSectionPos,
  to: OffsetT,
  rank: number,
  savedPassRanks?: Map<string, number>,
): StationStop[] {
  const ascending = from.offset.compare(to) < 0;
  const dir: 'ascending' | 'descending' = ascending ? 'ascending' : 'descending';
  return from.section.stations
    .filter(st => ascending
      ? from.offset.compare(st.interpT) < 0 && st.interpT.compare(to) < 0
      : from.offset.compare(st.interpT) > 0 && st.interpT.compare(to) > 0)
    .sort((a, b) => ascending ? a.interpT.compare(b.interpT) : b.interpT.compare(a.interpT))
    .map(st => st.makePassThroughStop(savedPassRanks?.get(`${st.id}:${dir}`) ?? rank, dir));
}

// Fills missing entries between currentPos and the upcoming stop:
//   - pass-through stops (via fillBetween) when on the same section
//   - auto-inserted RSC + surrounding pass-throughs when sections differ
function fillInMissingPaths(
  from: RoadSectionPos,
  to: StationStop,
  rank: number,
  prevStop: StationStop | null,
  savedPassRanks?: Map<string, number>,
): (RoadSectionChange | StationStop)[] {
  if (from.section === to.station.parentRoadSection) {
    return fillBetween(from, to.station.interpT, rank, savedPassRanks);
  }

  // Different sections: try to auto-insert an RSC between the two stops
  if (!prevStop) return [];
  const rsc = prevStop.autoInsertRSCTo(to);
  if (!rsc) return [];

  const result: (RoadSectionChange | StationStop)[] = [];
  const rscStart = rsc.start();
  const rscEnd   = rsc.end();

  if (rscStart?.section === from.section) {
    result.push(...fillBetween(from, rscStart.offset, rank, savedPassRanks));
  }
  result.push(rsc);
  if (rscEnd?.section === to.station.parentRoadSection) {
    result.push(...fillBetween(rscEnd, to.station.interpT, rsc.enterRank, savedPassRanks));
  }
  return result;
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

  // `currentPos` is the single running "previous" pointer the whole algorithm hinges
  // on: its offset carries the bias of whichever direction the line was last traveling
  // in. Every stop's direction is decided once, at the moment it's inserted, as the
  // sign of the hop that reached it (compare currentPos against the stop's raw
  // position) — never by looking ahead to what comes after it. That's what lets a
  // U-turn's pivot naturally re-surface via fillBetween's bias tie-break instead of
  // needing a dedicated "is this stop a pivot" check.
  let currentPos: RoadSectionPos | undefined;
  let prevStop: StationStop | null = null;

  for (const group of line.paths) {
    if (group.fromRoadSectionChange) {
      const rsc = group.fromRoadSectionChange;
      const rscStart = rsc.start();
      if (currentPos && currentPos.section === rscStart?.section) {
        const rank = prevStop?.rank ?? 0;
        for (const fill of fillBetween(currentPos, rscStart.offset, rank, savedPassRanks)) {
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
      if (currentPos && currentPos.section === stop.station.parentRoadSection) {
        stop.direction = currentPos.offset.compare(stop.station.interpT) < 0 ? 'ascending' : 'descending';
      } else if (!currentPos) {
        // Very first stop of the line — nothing to compare against yet.
        stop.direction = 'ascending';
      }
      // else: currentPos is on a different section (RSC crossing handled below via
      // fillInMissingPaths' auto-insert branch) — keep the stored/default direction.

      if (currentPos) {
        const rank = prevStop?.rank ?? stop.rank;
        for (const fill of fillInMissingPaths(currentPos, stop, rank, prevStop, savedPassRanks)) {
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
