export const LINE_SPACING = 6;
export const ROAD_MARGIN = 1;
export const ROAD_MIN_WIDTH = 8;
export const SECTION_GAP = 4;

export function sectionBandWidth(numLines: number): number {
  return numLines <= 0 ? ROAD_MIN_WIDTH : numLines * LINE_SPACING + 2 * ROAD_MARGIN;
}

export function lineOffsetInSection(lineIndex: number, numLines: number): number {
  return (lineIndex - (numLines - 1) / 2) * LINE_SPACING;
}