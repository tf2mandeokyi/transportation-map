import { Line, MapState, Road, RoadSection, Station } from "../models/structures";
import { LineId, RoadSectionId, StationId } from "@/common/types";
import { LINE_SPACING, ROAD_MARGIN, ROAD_MIN_WIDTH, SECTION_GAP, QuadBezierPoints } from "./bezier";

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
//   - road-section-enter (preceding): check which end of the dest road the node is on
//   - road-section-enter (following): check which end of the current road we exit from
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

  if (prev?.kind === 'road-section-enter') {
    const road = state.roads.get(prev.destRoadId);
    if (road) return prev.nodeId === road.startNodeId ? 'forward' : 'reverse';
  }

  // No usable preceding entry — infer from the following entry instead.
  const next = line.paths[segmentIndex + 1];
  if (next?.kind === 'station-stop') {
    const nextStation = state.stations.get(next.stationId);
    if (nextStation) return current.interpT < nextStation.interpT ? 'forward' : 'reverse';
  }
  if (next?.kind === 'road-section-enter') {
    if (!current.roadSectionId) return 'forward';
    const road = findRoadForSection(current.roadSectionId, state);
    if (!road) return 'forward';
    // Exiting at endNode → traversed forward; exiting at startNode → traversed reverse.
    return next.nodeId === road.endNodeId ? 'forward' : 'reverse';
  }

  return 'forward';
}

// referenceStationId: when supplied, uses that station's stop ranks to order lines
// on the road (caller passes the segment's departure station). Falls back to the
// section's first station (lowest interpT) when omitted.
export function getLinesForSection(
  section: RoadSection,
  state: Readonly<MapState>,
  referenceStationId?: StationId,
): Line[] {
  const lineIds = new Set<LineId>();

  if (referenceStationId) {
    // Only count lines that have a station-stop entry (stops: true or false) at the
    // reference station. Pass-throughs are now first-class entries inserted by the
    // validator, so this naturally excludes lines that end before this station.
    for (const line of state.lines.values()) {
      if (line.paths.some(p => p.kind === 'station-stop' && p.stationId === referenceStationId)) {
        lineIds.add(line.id);
      }
    }
  } else {
    for (const stationId of section.stationIds) {
      for (const line of state.lines.values()) {
        if (line.paths.some(p => p.kind === 'station-stop' && p.stationId === stationId)) {
          lineIds.add(line.id);
        }
      }
    }
  }

  const referenceStation: Station | undefined = referenceStationId
    ? state.stations.get(referenceStationId)
    : section.stationIds
        .map(id => state.stations.get(id))
        .filter((s): s is Station => s != null)
        .sort((a, b) => a.interpT - b.interpT)[0];

  let all: Line[];
  if (referenceStation) {
    const rankMap = new Map<LineId, number>();
    for (const line of state.lines.values()) {
      if (!lineIds.has(line.id)) continue;
      for (const p of line.paths) {
        if (p.kind === 'station-stop' && p.stationId === referenceStation.id) {
          rankMap.set(line.id, p.rank);
        }
      }
    }
    all = [...lineIds]
      .map(id => state.lines.get(id))
      .filter((l): l is Line => l != null)
      .sort((a, b) => {
        const ra = rankMap.get(a.id) ?? Infinity;
        const rb = rankMap.get(b.id) ?? Infinity;
        if (ra !== rb) return ra - rb;
        return state.lineStackingOrder.indexOf(a.id) - state.lineStackingOrder.indexOf(b.id);
      });
  } else {
    const inOrder = state.lineStackingOrder.filter(id => lineIds.has(id));
    const notInOrder = [...lineIds].filter(id => !state.lineStackingOrder.includes(id));
    all = [...inOrder, ...notInOrder]
      .map(id => state.lines.get(id))
      .filter((l): l is Line => l != null);
  }

  return all;
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
