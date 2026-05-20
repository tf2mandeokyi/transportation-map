import { Line, MapState, RoadSection } from "../models/structures";
import { LineId } from "@/common/types";
import { LINE_SPACING, ROAD_MARGIN, ROAD_MIN_WIDTH } from "./bezier";

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
  return [...inOrder, ...notInOrder]
    .map(id => state.lines.get(id)!)
    .filter(Boolean);
}

export function sectionBandWidth(numLines: number): number {
  return numLines <= 0 ? ROAD_MIN_WIDTH : numLines * LINE_SPACING + 2 * ROAD_MARGIN;
}

export function lineOffsetInSection(lineIndex: number, numLines: number): number {
  return (lineIndex - (numLines - 1) / 2) * LINE_SPACING;
}
