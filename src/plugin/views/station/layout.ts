import { Line, MapState, Station } from "../../models/structures";
import { LineId } from "@/common/types";
import { getLineDepartureAtStop, getLineDirectionAtStop } from "../../utils/section";
import { getStationStopsAcrossLines } from "../../utils/line-queries";

type CollectedEntry = {
  lineId: LineId;
  segmentIndex: number;
  rank: number;
  facing: 'left' | 'right';
  passThrough: boolean;
  departureRole: boolean;
  stackingOrder: number;
};

export type LineAtStation = {
  line: Line;
  segmentIndex: number;
  facing: 'left' | 'right';
  passThrough: boolean;
  departureRole: boolean;
};

export function getLinesForStation(
  station: Station, state: Readonly<MapState>
): LineAtStation[] {
  const entries: CollectedEntry[] = [];

  for (const { line, path } of getStationStopsAcrossLines(station.id, state)) {
    const stackingOrder = state.lineStackingOrder.indexOf(line.id);
    const arrivalDir = getLineDirectionAtStop(line, path.index, state);
    const facing: 'left' | 'right' = arrivalDir === 'forward' ? 'right' : 'left';
    entries.push({ lineId: line.id, segmentIndex: path.index, rank: path.rank, facing, passThrough: !path.stops, departureRole: false, stackingOrder });
    // U-turn: also add an entry for the departure direction when it differs from arrival.
    const departureDir = getLineDepartureAtStop(line, path.index, state);
    if (departureDir !== null && departureDir !== arrivalDir) {
      const departureFacing: 'left' | 'right' = departureDir === 'forward' ? 'right' : 'left';
      // The departure side of a U-turn is always shown as a pass-through indicator,
      // even when the station itself is an explicit stop.
      entries.push({ lineId: line.id, segmentIndex: path.index, rank: path.rank, facing: departureFacing, passThrough: true, departureRole: true, stackingOrder });
    }
  }

  entries.sort((a, b) => a.rank !== b.rank ? a.rank - b.rank : a.stackingOrder - b.stackingOrder);

  return entries.map(({ lineId, segmentIndex, facing, passThrough, departureRole }) => {
    const line = state.lines.get(lineId);
    if (!line) return null;
    return { line, segmentIndex, facing, passThrough, departureRole };
  }).filter((item): item is LineAtStation => item !== null);
}
