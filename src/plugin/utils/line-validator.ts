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
  // Flattened real stops (pass-throughs already stripped by the `!stop.stops` filter
  // below) — used only to peek one stop ahead when picking the very first stop's
  // initial direction, since at that point there's no currentPos to compare against.
  const realStops = line.paths.flatMap(group => group.stationStops.filter(s => s.stops));

  let currentPos: RoadSectionPos | undefined;
  let currentDir: 'ascending' | 'descending' | undefined;
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
      currentDir = rsc.entering ? (rsc.entering.side === 0 ? 'ascending' : 'descending') : undefined;
    }

    const stops = group.stationStops;
    for (const element of stops) {
      const stop = element;
      if (!stop.stops) continue; // strip stale pass-throughs left over from a previous validation run

      // Direction must be set before calling start()/end(), since those use it for bias.
      if (currentPos?.section === stop.station.parentRoadSection) {
        stop.direction = currentPos.offset.compare(stop.station.interpT) < 0 ? 'ascending' : 'descending';
      } else if (!currentPos) {
        // Very first stop of the line — nothing to compare against yet. Peek at the
        // next real stop: if it's on the same section, infer direction from the raw
        // interpT ordering instead of blindly defaulting to 'ascending', which would
        // otherwise mis-bias this stop and spuriously trigger the U-turn shadow logic
        // in fillBetween on a perfectly straight two-stop path. If there's no such
        // reference (no next stop, or it's on a different section), direction is
        // inherently ambiguous here — leave the stored value alone rather than
        // stomping it, so a manual override (see Line.setStopDirection) sticks.
        const next = realStops[1];
        if (next && next.station.parentRoadSection === stop.station.parentRoadSection) {
          stop.direction = stop.station.interpT.compare(next.station.interpT) < 0 ? 'ascending' : 'descending';
        }
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
      currentDir = stop.direction;
      prevStop = stop;
    }
  }

  // The path's tail — whatever section it currently ends in, whether reached via the
  // last real stop or a bare road crossing with no stops of its own — gets every
  // remaining station up to that section's far boundary auto-filled as a checkable
  // (non-stopping) candidate. "Add Road" is the only way to extend a path now; this is
  // how the entered section's stations become available to check on, rather than
  // needing a separate "add station" action. Regenerated fresh every validation pass,
  // same as any other pass-through — nothing here is preserved as authored data.
  if (currentPos && currentDir) {
    const boundary = currentDir === 'ascending' ? new OffsetT(1) : new OffsetT(0);
    const rank = prevStop?.rank ?? 0;
    for (const fill of fillBetween(currentPos, boundary, rank, savedPassRanks)) {
      pushStop(fill);
    }
  }

  // Drop a trailing *bare* group (no RSC of its own) that ended up with nothing to
  // check. A group backed by a real RoadSectionChange is kept even with zero stops —
  // "Add Road" is the only way to extend a path now, so a just-added road into a
  // stationless connector section is expected, legitimate tail state (the user may
  // still chain another road after it), not a dangling artifact to discard.
  while (
    result.length > 0 &&
    result[result.length - 1].stationStops.length === 0 &&
    !result[result.length - 1].fromRoadSectionChange
  ) result.pop();

  return result.map(group => own(group));
}
