import { Line, MapState, RoadSection } from "../models/structures";
import { LineId } from "@/common/types";
import { LINE_SPACING, ROAD_MARGIN, ROAD_MIN_WIDTH } from "./bezier";

// Determines traversal direction for a line at a specific station stop (by path
// index). Checks the immediately preceding path entry only:
//   - station-stop: compare interpT (smaller → larger = forward)
//   - road-section-enter: check which end of the destination road the node is on
export function getLineDirectionAtStop(
  line: Line, segmentIndex: number, state: Readonly<MapState>
): 'forward' | 'reverse' {
  const currentPath = line.paths[segmentIndex];
  if (currentPath?.kind !== 'station-stop') return 'forward';
  const current = state.stations.get(currentPath.stationId);
  if (!current) return 'forward';

  const prev = line.paths[segmentIndex - 1];
  if (!prev) return 'forward';

  if (prev.kind === 'station-stop') {
    const prevStation = state.stations.get(prev.stationId);
    if (!prevStation) return 'forward';
    return prevStation.interpT < current.interpT ? 'forward' : 'reverse';
  }

  if (prev.kind === 'road-section-enter') {
    const road = state.roads.get(prev.destRoadId);
    if (!road) return 'forward';
    return prev.nodeId === road.startNodeId ? 'forward' : 'reverse';
  }

  return 'forward';
}

function getFirstStopIndexOnSection(line: Line, section: RoadSection): number {
  for (let i = 0; i < line.paths.length; i++) {
    const p = line.paths[i];
    if (p.kind === 'station-stop' && section.stationIds.includes(p.stationId)) return i;
  }
  return -1;
}

export function getLinesForSection(section: RoadSection, state: Readonly<MapState>): Line[] {
  const lineIds = new Set<LineId>();
  for (const stationId of section.stationIds) {
    for (const line of state.lines.values()) {
      if (line.paths.some(p => p.kind === 'station-stop' && p.stationId === stationId)) {
        lineIds.add(line.id);
      }
    }
  }

  const inOrder = state.lineStackingOrder.filter(id => lineIds.has(id));
  const notInOrder = [...lineIds].filter(id => !state.lineStackingOrder.includes(id));
  const all = [...inOrder, ...notInOrder].map(id => state.lines.get(id)!).filter(Boolean);

  // Forward lines first, reverse lines last — within each group the stacking order
  // is preserved. Combined with the directedOffset sign-flip in the line renderer,
  // this guarantees opposite-direction lines land on opposite canonical sides.
  const forward = all.filter(l => {
    const idx = getFirstStopIndexOnSection(l, section);
    return idx < 0 || getLineDirectionAtStop(l, idx, state) === 'forward';
  });
  const reverse = all.filter(l => {
    const idx = getFirstStopIndexOnSection(l, section);
    return idx >= 0 && getLineDirectionAtStop(l, idx, state) === 'reverse';
  });
  return [...forward, ...reverse];
}

export function sectionBandWidth(numLines: number): number {
  return numLines <= 0 ? ROAD_MIN_WIDTH : numLines * LINE_SPACING + 2 * ROAD_MARGIN;
}

export function lineOffsetInSection(lineIndex: number, numLines: number): number {
  return (lineIndex - (numLines - 1) / 2) * LINE_SPACING;
}
