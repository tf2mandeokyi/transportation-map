import { Line, Station } from "../../models/structures";

export type LineAtStation = {
  line: Line;
  groupIndex: number;
  stopIndex: number;
  facing: 'left' | 'right';
  passThrough: boolean;
};

export function getLinesForStation(station: Station): LineAtStation[] {
  return station.getStopsAcrossLines().map(({ line, groupIndex, stopIndex, facing, stops }) => ({
    line, groupIndex, stopIndex, facing, passThrough: !stops,
  }));
}
