import { Line, Station } from "../../models/structures";

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
  station: Station
): LineAtStation[] {
  const entries: CollectedEntry[] = [];

  for (const { line, path } of station.getStopsAcrossLines()) {
    const facing: 'left' | 'right' = path.direction === 'ascending' ? 'right' : 'left';
    entries.push({ line, segmentIndex: path.index, rank: path.rank, facing, passThrough: !path.stops, stackingOrder: 0 });
  }

  entries.sort((a, b) => a.rank !== b.rank ? a.rank - b.rank : a.stackingOrder - b.stackingOrder);

  return entries.map(({ line, segmentIndex, facing, passThrough }) => ({ line, segmentIndex, facing, passThrough }));
}
