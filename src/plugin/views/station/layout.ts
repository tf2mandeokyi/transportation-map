import { Line, Station } from "../../models/structures";

export type LineAtStation = {
  line: Line;
  passIndex: number;
  facing: 'left' | 'right';
  passThrough: boolean;
};

export function getLinesForStation(station: Station): LineAtStation[] {
  return station.getStopsAcrossLines().map(({ line, passIndex, facing, stops }) => ({
    line, passIndex, facing, passThrough: !stops,
  }));
}
