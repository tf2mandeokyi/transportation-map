import { Line, MapState, Station } from "../../models/structures";
import { getStationStopsAcrossLines } from "../../utils/line-queries";

type CollectedEntry = {
  line: Line;
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
    entries.push({ line, segmentIndex: path.index, rank: path.rank, facing, passThrough: !path.stops, stackingOrder });
  }

  entries.sort((a, b) => a.rank !== b.rank ? a.rank - b.rank : a.stackingOrder - b.stackingOrder);

  return entries.map(({ line, segmentIndex, facing, passThrough }) => ({ line, segmentIndex, facing, passThrough }));
}
