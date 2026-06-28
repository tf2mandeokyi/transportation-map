import { LineId } from "@/common/types";
import { LinePathData } from "@/common/messages";
import { MapState } from './map-state';
import { LinePath, SerializedLinePath, StationStop } from './line-path';
import { validateLinePaths } from '../../utils/line-validator';
import { TransportationMapObject } from "./types";
import { Owned } from "@/common/utils/ownership";
import { RoadSection } from "./road-section";
import { PathEntry } from "@/plugin/utils/path-entry";

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
  paths!: Owned<LinePath>[];
  figmaGroupId!: string | null;

  applyProps(props: LineProps): this {
    this.name = props.name;
    this.color = props.color;
    this.isCircular = props.isCircular;
    this.paths = props.paths ?? [];
    this.figmaGroupId = props.figmaGroupId ?? null;
    return this;
  }

  applySerialized(ser: SerializedLine): this {
    this.name = ser.n;
    this.color = ser.c;
    this.isCircular = ser.l;
    this.paths = (ser.p ?? []).map(p => LinePath.deserialize(this.mapState, p));
    this.figmaGroupId = ser.g ?? null;
    return this;
  }

  serialize(): SerializedLine {
    return {
      n: this.name,
      c: this.color,
      l: this.isCircular,
      p: this.paths.map(path => path.serialize()),
      g: this.figmaGroupId,
    };
  }
  
  computeEntry(path: LinePath): PathEntry<LinePath> {
    if (path.kind === 'station-stop') {
      const section = (path.station.parentRoadSection as RoadSection | undefined) ?? null;
      const road = section?.parentRoad ?? null;
      return new PathEntry(this, path, path.rank, road, section);
    }
    const entry = path.exiting ?? path.entering;
    const section = entry?.section ?? null;
    const road = section?.parentRoad ?? null;
    const rank = path.exiting === null ? path.enterRank : path.exitRank;
    return new PathEntry(this, path, rank, road, section);
  }

  addPath(path: LinePathData): void {
    this.paths.push(LinePath.fromData(this.mapState, path));
    this.paths = validateLinePaths(this);
  }

  replacePaths(paths: LinePathData[]): void {
    const newPaths: Owned<LinePath>[] = [];
    for (let i = 0; i < paths.length; i++) {
      const p = paths[i];
      const linePath = LinePath.fromData(this.mapState, p);
      linePath.index = i;
      newPaths.push(linePath);
    }
    this.paths = newPaths;
    this.paths = validateLinePaths(this);
  }

  removePath(pathIndex: number): void {
    this.paths = this.paths.filter(p => p.index !== pathIndex);
    this.paths.forEach((p, i) => { p.index = i; });
    this.paths = validateLinePaths(this);
  }

  setStopFlag(pathIndex: number, stops: boolean): void {
    const path = this.paths.find(p => p.index === pathIndex);
    if (!path || !(path instanceof StationStop)) return;
    path.stops = stops;
    this.paths = validateLinePaths(this);
  }
  
  // Counts the number of directed runs a line makes on a section.
  // Also counts runs that enter the section via RSE but have no station-stops on it
  // (pure through-passes between two junctions).
  countPassesOnSection(section: RoadSection): number {
    const sectionStationSet = new Set(section.stations);
    let passes = 0;
    let onSection = false;
    let enteredViaRse = false;

    for (const p of this.paths) {
      if (p.kind === 'road-section-change') {
        if (enteredViaRse) {
          passes++;
          enteredViaRse = false;
        }
        onSection = false;
        if (p.entering?.section === section) enteredViaRse = true;
        continue;
      }
      if (!sectionStationSet.has(p.station)) {
        if (enteredViaRse) {
          passes++;
          enteredViaRse = false;
        }
        onSection = false;
        continue;
      }

      enteredViaRse = false;
      if (!onSection) {
        passes++;
        onSection = true;
      }
    }

    if (enteredViaRse) passes++;

    return passes;
  }

  static deserialize(mapState: Readonly<MapState>, id: LineId, ser: SerializedLine): Line {
    return new Line(mapState, id).applySerialized(ser);
  }
}
