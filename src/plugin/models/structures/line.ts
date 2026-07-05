import { LineId } from "@/common/types";
import { LinePathData, LinePathStationStopData } from "@/common/messages";
import { MapState } from './map-state';
import { RoadSectionChange, SerializedLinePath, StationStop, linePathsFromData, linePathsSerialize, linePathsDeserialize, LinePath } from './line-path';
import { validateLinePaths } from '../../utils/line-validator';
import { TransportationMapObject } from "./types";
import { Owned, own } from "@/common/utils/ownership";
import { RoadSection } from "./road-section";

export type { SerializedLinePath } from './line-path';

export interface SerializedLine {
  n: string;               // name
  c: string;               // color (hex)
  l: boolean;              // isCircular
  p: SerializedLinePath[]; // paths
  g: string | null;        // figmaGroupId
}

export interface LineProps {
  name: string;
  color: string;
  isCircular: boolean;
  paths: Owned<LinePath>[];
  figmaGroupId: string | null;
}

export class Line extends TransportationMapObject<LineId> {
  name!: string;
  color!: string;
  isCircular!: boolean;
  private _paths!: Owned<LinePath>[];
  figmaGroupId!: string | null;

  get paths(): LinePath[] {
    return this._paths;
  }

  set paths(paths: LinePath[]) {
    this._paths = paths.map(p => own(p));
  }

  applyProps(props: LineProps): this {
    this.name = props.name;
    this.color = props.color;
    this.isCircular = props.isCircular;
    this._paths = props.paths ?? [];
    this.figmaGroupId = props.figmaGroupId ?? null;
    return this;
  }

  applySerialized(ser: SerializedLine): this {
    this.name = ser.n;
    this.color = ser.c;
    this.isCircular = ser.l;
    this._paths = linePathsDeserialize(this.mapState, ser.p ?? []);
    this.figmaGroupId = ser.g ?? null;
    return this;
  }

  serialize(): SerializedLine {
    return {
      n: this.name,
      c: this.color,
      l: this.isCircular,
      p: linePathsSerialize(this.paths),
      g: this.figmaGroupId,
    };
  }

  replacePaths(paths: LinePathData[]): void {
    this._paths = linePathsFromData(this.mapState, paths);
    this._paths = validateLinePaths(this);
  }

  // Appends a single station stop to the end of the path. Used by
  // programmatic line-building code that has no need for the grouped wire format.
  appendStationStop(data: LinePathStationStopData): void {
    const entry = StationStop.fromData(this.mapState, data);
    const lastGroup = this.paths[this.paths.length - 1];
    if (lastGroup) {
      lastGroup.stationStops.push(entry);
    } else {
      const bare = new LinePath();
      bare.stationStops = [entry];
      this._paths = [own(bare)];
    }
    this._paths = validateLinePaths(this);
  }

  // Inserts a station stop right after the given address. stopIndex === -1 means
  // "at the group's RSC" (i.e. becomes the group's first stop); groupIndex < 0 means
  // "before everything".
  insertStationStopAt(groupIndex: number, stopIndex: number, data: LinePathStationStopData): void {
    const entry = StationStop.fromData(this.mapState, data);
    if (groupIndex < 0) {
      const first = this.paths[0];
      if (first && !first.fromRoadSectionChange) {
        first.stationStops.unshift(entry);
      } else {
        const bare = new LinePath();
        bare.stationStops = [entry];
        this._paths = [own(bare), ...this._paths];
      }
    } else {
      const group = this.paths[groupIndex];
      if (group) group.stationStops.splice(stopIndex + 1, 0, entry);
    }
    this._paths = validateLinePaths(this);
  }

  // Removes an entry addressed by (groupIndex, stopIndex): stopIndex === -1 removes
  // the group's RSC (its trailing stops merge into the preceding group once
  // re-validated); stopIndex >= 0 removes that station stop.
  removePath(groupIndex: number, stopIndex: number): void {
    const group = this.paths[groupIndex];
    if (!group) return;
    if (stopIndex === -1) {
      group.fromRoadSectionChange = undefined;
    } else {
      group.stationStops.splice(stopIndex, 1);
    }
    this._paths = validateLinePaths(this);
  }

  setStopFlag(groupIndex: number, stopIndex: number, stops: boolean): void {
    const stop = this.paths[groupIndex]?.stationStops[stopIndex];
    if (stop) stop.stops = stops;
  }

  // Manually flips a stop's direction. validateLinePaths recomputes direction from
  // geometry wherever it can (i.e. whenever the running position from the previous
  // stop lands on the same road section as this one), so this only has a lasting
  // effect where direction is otherwise ambiguous — mainly the very first stop of
  // the line when there's no same-section stop after it to compare against.
  setStopDirection(groupIndex: number, stopIndex: number, direction: 'ascending' | 'descending'): void {
    const stop = this.paths[groupIndex]?.stationStops[stopIndex];
    if (!stop) return;
    stop.direction = direction;
    this._paths = validateLinePaths(this);
  }

  // Counts the number of directed runs a line makes on a section.
  // Also counts runs that enter the section via RSE but have no station-stops on it
  // (pure through-passes between two junctions).
  countPassesOnSection(section: RoadSection): number {
    const sectionStationSet = new Set(section.stations);
    let passes = 0;
    let onSection = false;
    let enteredViaRse = false;

    const processRsc = (p: RoadSectionChange): void => {
      if (enteredViaRse) {
        passes++;
        enteredViaRse = false;
      }
      onSection = false;
      if (p.entering?.section === section) enteredViaRse = true;
    };

    const processStop = (p: StationStop): void => {
      if (!sectionStationSet.has(p.station)) {
        if (enteredViaRse) {
          passes++;
          enteredViaRse = false;
        }
        onSection = false;
        return;
      }
      enteredViaRse = false;
      if (!onSection) {
        passes++;
        onSection = true;
      }
    };

    for (const group of this.paths) {
      if (group.fromRoadSectionChange) processRsc(group.fromRoadSectionChange);
      for (const stop of group.stationStops) processStop(stop);
    }

    if (enteredViaRse) passes++;

    return passes;
  }

  // Rotates the path's groups by `steps` — used to change a circular line's start point.
  rotateGroups(steps: number): void {
    const n = this.paths.length;
    if (n === 0) return;
    const normalized = ((steps % n) + n) % n;
    if (normalized === 0) return;
    this._paths = [...this._paths.slice(normalized), ...this._paths.slice(0, normalized)];
    this._paths = validateLinePaths(this);
  }

  static deserialize(mapState: Readonly<MapState>, id: LineId, ser: SerializedLine): Line {
    return new Line(mapState, id).applySerialized(ser);
  }
}
