import { Line, MapState, Station } from "../../models/structures";
import { LineId } from "@/common/types";
import { getLineDirectionAtStop } from "../../utils/section";

type CollectedEntry = {
  lineId: LineId;
  segmentIndex: number;
  rank: number;
  facing: 'left' | 'right';
  passThrough: boolean;
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

  for (const line of state.lines.values()) {
    for (let i = 0; i < line.paths.length; i++) {
      const path = line.paths[i];
      if (path.kind === 'station-stop' && path.stationId === station.id) {
        const facing: 'left' | 'right' = getLineDirectionAtStop(line, i, state) === 'forward' ? 'right' : 'left';
        entries.push({ lineId: line.id, segmentIndex: i, rank: path.rank, facing, passThrough: !path.stops });
        break;
      }
    }
  }

  entries.sort((a, b) => a.rank - b.rank);

  return entries.map(({ lineId, segmentIndex, facing, passThrough }) => {
    const line = state.lines.get(lineId);
    if (!line) return null;
    return { line, segmentIndex, facing, passThrough };
  }).filter((item): item is LineAtStation => item !== null);
}
