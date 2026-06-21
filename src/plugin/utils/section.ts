import { Line, MapState, Road, RoadSection, Station } from "../models/structures";
import { RoadSectionId, StationId } from "@/common/types";
import { LINE_SPACING, ROAD_MARGIN, ROAD_MIN_WIDTH, SECTION_GAP, QuadBezierPoints } from "./bezier";

// A single directed pass of a line through a section. For lines that U-turn on a
// section the same line appears multiple times, once per pass.
export type LinePass = {
  line: Line;
  segmentIndex: number;    // path index of the station-stop entry at the reference station
  departureRole: boolean;  // true when this slot is for the U-turn departure direction
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
// Returns the direction the line heads OUT of a station stop — based on the
// following path entry. Returns null when there is no following entry.
export function getLineDepartureAtStop(
  line: Line, segmentIndex: number, state: Readonly<MapState>
): 'forward' | 'reverse' | null {
  const currentPath = line.paths[segmentIndex];
  if (currentPath?.kind !== 'station-stop') return null;
  const current = state.stations.get(currentPath.stationId);
  if (!current) return null;

  const next = line.paths[segmentIndex + 1];
  if (!next) return null;

  if (next.kind === 'station-stop') {
    const nextStation = state.stations.get(next.stationId);
    if (nextStation) return current.interpT < nextStation.interpT ? 'forward' : 'reverse';
  }
  if (next.kind === 'road-section-change') {
    if (!current.roadSectionId) return null;
    const road = findRoadForSection(current.roadSectionId, state);
    if (!road) return null;
    return next.nodeId === road.endNodeId ? 'forward' : 'reverse';
  }

  return null;
}

// Counts the number of directed runs a line makes on a section. Each direction
// reversal (U-turn) starts a new run; each run occupies a distinct lateral lane.
function countPassesOnSection(line: Line, section: RoadSection, state: Readonly<MapState>): number {
  const sectionStationSet = new Set(section.stationIds);
  let passes = 0;
  let onSection = false;
  let prevStation: Station | null = null;
  let prevForward: boolean | null = null;

  for (const p of line.paths) {
    if (p.kind === 'road-section-change') {
      onSection = false;
      prevStation = null;
      prevForward = null;
      continue;
    }
    if (!sectionStationSet.has(p.stationId)) {
      onSection = false;
      prevStation = null;
      prevForward = null;
      continue;
    }
    const st = state.stations.get(p.stationId);
    if (!st) continue;

    if (!onSection) {
      passes++;
      onSection = true;
      prevStation = st;
      prevForward = null;
    } else if (prevStation) {
      const forward = st.interpT > prevStation.interpT;
      if (prevForward !== null && forward !== prevForward) passes++; // U-turn = new lane
      prevForward = forward;
      prevStation = st;
    }
  }
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
    // One entry per occurrence of the reference station. A U-turn stop (where
    // arrival and departure directions differ) gets two entries: one for the
    // arrival slot and one for the departure slot.
    const passes: Array<LinePass & { rank: number }> = [];
    for (const line of state.lines.values()) {
      for (const p of line.paths) {
        if (p.kind === 'station-stop' && p.stationId === referenceStationId) {
          passes.push({ line, segmentIndex: p.index, departureRole: false, rank: p.rank });
          const arrDir = getLineDirectionAtStop(line, p.index, state);
          const depDir = getLineDepartureAtStop(line, p.index, state);
          if (depDir !== null && depDir !== arrDir) {
            passes.push({ line, segmentIndex: p.index, departureRole: true, rank: p.rank });
          }
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
      allPasses.push({ line, segmentIndex: -1, departureRole: false });
    }
  }
  return allPasses;
}

export function sectionBandWidth(numLines: number): number {
  return numLines <= 0 ? ROAD_MIN_WIDTH : numLines * LINE_SPACING + 2 * ROAD_MARGIN;
}

export function lineOffsetInSection(lineIndex: number, numLines: number): number {
  return (lineIndex - (numLines - 1) / 2) * LINE_SPACING;
}

// Lateral offset of a section's centerline from the road centerline, computed
// from cumulative section widths so sections never visually overlap regardless
// of how many lines each section carries.
export function computeSectionOffset(
  section: RoadSection,
  road: Road,
  state: Readonly<MapState>,
): number {
  const sections = Array.from(road.sections.values()).sort((a, b) => a.index - b.index);
  const widths = sections.map(s => sectionBandWidth(getLinesForSection(s, state).length));
  const gapTotal = Math.max(0, sections.length - 1) * SECTION_GAP;
  const totalWidth = widths.reduce((a, b) => a + b, 0) + gapTotal;
  let cumulative = -totalWidth / 2;
  for (let i = 0; i < sections.length; i++) {
    const center = cumulative + widths[i] / 2;
    if (sections[i].id === section.id) return center;
    cumulative += widths[i] + SECTION_GAP;
  }
  return 0;
}
