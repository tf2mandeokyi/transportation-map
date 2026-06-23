import { Line, MapState, Road, RoadSection } from "../models/structures";
import { RoadSectionId, StationId } from "@/common/types";
import { QuadBezierPoints } from "./bezier";

// A single directed pass of a line through a section.
export type LinePass = {
  line: Line;
  segmentIndex: number;    // path index of the station-stop entry at the reference station
};

export function findRoadForSection(sectionId: RoadSectionId, state: Readonly<MapState>): Road | null {
  for (const road of state.roads.values()) {
    if (road.sections.has(sectionId)) return road;
  }
  return null;
}

export function computeRoadBezier(road: Road, state: Readonly<MapState>): QuadBezierPoints | null {
  const startNode = state.nodes.get(road.startNodeId);
  const endNode = state.nodes.get(road.endNodeId);
  if (!startNode || !endNode) return null;
  return {
    p0: road.endpoints[0].endpointPos,
    p1: road.bezierMidPoint,
    p2: road.endpoints[1].endpointPos,
  };
}

// Determines traversal direction for a line at a specific station stop (by path
// index). Checks the preceding entry first; when unavailable (first stop or
// circular wrap) falls back to the following entry.
//   - station-stop: compare interpT (smaller → larger = forward)
//   - road-section-change (preceding): check which end of the entering road the node is on
//   - road-section-change (following): check which end of the current road we exit from
export function getLineDirectionAtStop(
  line: Line, segmentIndex: number, state: Readonly<MapState>
): 'forward' | 'reverse' {
  const currentPath = line.paths[segmentIndex];
  if (currentPath?.kind !== 'station-stop') return 'forward';
  const current = state.stations.get(currentPath.stationId);
  if (!current) return 'forward';

  const prev = segmentIndex > 0
    ? line.paths[segmentIndex - 1]
    : (line.isCircular ? line.paths[line.paths.length - 1] : undefined);

  if (prev?.kind === 'station-stop') {
    const prevStation = state.stations.get(prev.stationId);
    if (prevStation) return prevStation.interpT < current.interpT ? 'forward' : 'reverse';
  }

  if (prev?.kind === 'road-section-change') {
    if (!prev.entering) return 'forward';
    const road = findRoadForSection(prev.entering, state);
    if (road) return prev.nodeId === road.startNodeId ? 'forward' : 'reverse';
  }

  // No usable preceding entry — infer from the following entry instead.
  const next = line.paths[segmentIndex + 1];
  if (next?.kind === 'station-stop') {
    const nextStation = state.stations.get(next.stationId);
    if (nextStation) return current.interpT < nextStation.interpT ? 'forward' : 'reverse';
  }
  if (next?.kind === 'road-section-change') {
    if (!current.roadSectionId) return 'forward';
    const road = findRoadForSection(current.roadSectionId, state);
    if (!road) return 'forward';
    return next.nodeId === road.endNodeId ? 'forward' : 'reverse';
  }

  return 'forward';
}

// referenceStationId: when supplied, uses that station's stop ranks to order lines
// on the road (caller passes the segment's departure station). Falls back to the
// section's first station (lowest interpT) when omitted.
// Counts the number of directed runs a line makes on a section.
// Also counts runs that enter the section via RSE but have no station-stops on it
// (pure through-passes between two junctions).
function countPassesOnSection(line: Line, section: RoadSection, state: Readonly<MapState>): number {
  const sectionStationSet = new Set(section.stationIds);
  let passes = 0;
  let onSection = false;
  let enteredViaRse = false; // entered via RSE but no station on this section yet

  for (const p of line.paths) {
    if (p.kind === 'road-section-change') {
      if (enteredViaRse) {
        passes++;
        enteredViaRse = false;
      }
      onSection = false;
      if (p.entering === section.id) enteredViaRse = true;
      continue;
    }
    if (!sectionStationSet.has(p.stationId)) {
      if (enteredViaRse) {
        passes++;
        enteredViaRse = false;
      }
      onSection = false;
      continue;
    }
    if (!state.stations.get(p.stationId)) continue;

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
        if (p.kind === 'station-stop' && p.stationId === referenceStationId) {
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
    const count = countPassesOnSection(line, section, state);
    for (let i = 0; i < count; i++) {
      allPasses.push({ line, segmentIndex: -1 });
    }
  }
  return allPasses;
}

