import { Line, MapState, RoadSection } from "../models/structures";
import { StationId } from "@/common/types";

// A single directed pass of a line through a section.
export type LinePass = {
  line: Line;
  segmentIndex: number;    // path index of the station-stop entry at the reference station
};

// Counts the number of directed runs a line makes on a section.
// Also counts runs that enter the section via RSE but have no station-stops on it
// (pure through-passes between two junctions).
function countPassesOnSection(line: Line, section: RoadSection): number {
  const sectionStationSet = new Set(section.stations);
  let passes = 0;
  let onSection = false;
  let enteredViaRse = false;

  for (const p of line.paths) {
    if (p.kind === 'road-section-change') {
      if (enteredViaRse) {
        passes++;
        enteredViaRse = false;
      }
      onSection = false;
      if (p.entering === section) enteredViaRse = true;
      continue;
    }
    if (!sectionStationSet.has(p.station)) {
      if (enteredViaRse) {
        passes++;
        enteredViaRse = false;
      }
      onSection = false;
      continue;
    }

    enteredViaRse = false;
    if (!onSection) {
      passes++;
      onSection = true;
    }
  }

  if (enteredViaRse) passes++;

  return passes;
}

// Returns one LinePass per directed run (lane slot) on the section.
// With referenceStationId: one entry per occurrence of that station in any line's path,
//   sorted by rank so lane ordering is consistent with station stop ordering.
// Without referenceStationId: one entry per directed run across all lines; only
//   .length is meaningful (used for road-width computations).
export function getLinesForSection(
  section: RoadSection,
  state: Readonly<MapState>,
  referenceStationId?: StationId,
): LinePass[] {
  if (referenceStationId) {
    const passes: Array<LinePass & { rank: number }> = [];
    for (const line of state.lines.values()) {
      for (const p of line.paths) {
        if (p.kind === 'station-stop' && p.station.id === referenceStationId) {
          passes.push({ line, segmentIndex: p.index, rank: p.rank });
        }
      }
    }
    passes.sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      const sa = state.lineStackingOrder.indexOf(a.line.id);
      const sb = state.lineStackingOrder.indexOf(b.line.id);
      return sa - sb;
    });
    return passes;
  }

  // No reference station: count directed runs per line for road-width sizing.
  const allPasses: LinePass[] = [];
  for (const line of state.lines.values()) {
    const count = countPassesOnSection(line, section);
    for (let i = 0; i < count; i++) {
      allPasses.push({ line, segmentIndex: -1 });
    }
  }
  return allPasses;
}
