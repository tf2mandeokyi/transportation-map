import { Line, MapState, Station } from "../../models/structures";
import { HVAlign, LineId } from "@/common/types";
import { getLineDirectionAtStop } from "../../utils/section";

export function getLayoutParams(textAlign: HVAlign): {
  rotation: number;
  textLocation: 'left' | 'right' | 'top' | 'bottom';
  reverseOrder: boolean;
} {
  switch (textAlign) {
    case 'right':  return { rotation: 0, textLocation: 'right',  reverseOrder: false };
    case 'left':   return { rotation: 0, textLocation: 'left',   reverseOrder: false };
    case 'bottom': return { rotation: 0, textLocation: 'bottom', reverseOrder: false };
    case 'top':    return { rotation: 0, textLocation: 'top',    reverseOrder: false };
  }
}

type StopEntry = { lineId: LineId; segmentIndex: number; rank: number };

function compareStopEntries(a: StopEntry, b: StopEntry, globalOrder: LineId[]): number {
  if (a.rank !== b.rank) return a.rank - b.rank;
  const oa = globalOrder.indexOf(a.lineId);
  const ob = globalOrder.indexOf(b.lineId);
  if (oa !== ob) return oa - ob;
  return a.segmentIndex - b.segmentIndex;
}

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

  const globalOrder = state.lineStackingOrder;
  result.sort((a, b) => compareStopEntries(a, b, globalOrder));

  return result.map(({ lineId, segmentIndex }) => {
    const line = state.lines.get(lineId);
    if (!line) return null;
    const facing: 'left' | 'right' = getLineDirectionAtStop(line, segmentIndex, state) === 'forward' ? 'right' : 'left';
    return { line, segmentIndex, facing };
  }).filter((item): item is { line: Line; segmentIndex: number; facing: 'left' | 'right' } => item !== null);
}
