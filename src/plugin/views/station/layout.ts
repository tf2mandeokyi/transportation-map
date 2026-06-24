import { Line, MapState, Station } from "../../models/structures";
import { LineId } from "@/common/types";
import { getStationStopsAcrossLines } from "../../utils/line-queries";

type CollectedEntry = {
  lineId: LineId;
  segmentIndex: number;
  rank: number;
  facing: 'left' | 'right';
  passThrough: boolean;
  stackingOrder: number;
};

export type LineAtStation = {
  line: Line;
  segmentIndex: number;
  facing: 'left' | 'right';
  passThrough: boolean;
};

export function getLinesForStation(
  station: Station, state: Readonly<MapState>
): LineAtStation[] {
  const entries: CollectedEntry[] = [];

  for (const { line, path } of getStationStopsAcrossLines(station, state)) {
    const stackingOrder = state.lineStackingOrder.indexOf(line.id);
    const arrivalDir = line.getDirectionAtStop(path.index);
    const facing: 'left' | 'right' = arrivalDir === 'ascending' ? 'right' : 'left';
    entries.push({ lineId: line.id, segmentIndex: path.index, rank: path.rank, facing, passThrough: !path.stops, stackingOrder });
  }

  entries.sort((a, b) => a.rank !== b.rank ? a.rank - b.rank : a.stackingOrder - b.stackingOrder);

  return entries.map(({ lineId, segmentIndex, facing, passThrough }) => {
    const line = state.lines.get(lineId);
    if (!line) return null;
    return { line, segmentIndex, facing, passThrough };
  }).filter((item): item is LineAtStation => item !== null);
}
