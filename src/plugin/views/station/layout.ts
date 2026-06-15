import { Line, MapState, Station } from "../../models/structures";
import { LineId } from "@/common/types";
import { getLineDirectionAtStop } from "../../utils/section";

type StopEntry = { lineId: LineId; segmentIndex: number; rank: number };

export function getLinesForStation(
  station: Station, state: Readonly<MapState>
): Array<{ line: Line; segmentIndex: number; facing: 'left' | 'right' }> {
  const result: StopEntry[] = [];
  for (const line of state.lines.values()) {
    for (let i = 0; i < line.paths.length; i++) {
      const path = line.paths[i];
      if (path.kind === 'station-stop' && path.stationId === station.id) {
        result.push({ lineId: line.id, segmentIndex: i, rank: path.rank });
      }
    }
  }

  result.sort((a, b) => a.rank - b.rank);

  return result.map(({ lineId, segmentIndex }) => {
    const line = state.lines.get(lineId);
    if (!line) return null;
    const facing: 'left' | 'right' = getLineDirectionAtStop(line, segmentIndex, state) === 'forward' ? 'right' : 'left';
    return { line, segmentIndex, facing };
  }).filter((item): item is { line: Line; segmentIndex: number; facing: 'left' | 'right' } => item !== null);
}
