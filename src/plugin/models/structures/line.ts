import { LineId, StationId } from "@/common/types";
import { RoadSectionPassData } from "@/common/messages";
import { MapState } from './map-state';
import { RoadSectionPass, SerializedRoadSectionPass, linePathsFromData, linePathsSerialize, linePathsDeserialize } from './line-path';
import { validateLinePaths } from '../../utils/line-validator';
import { TransportationMapObject } from "./types";
import { Owned, own } from "@/common/utils/ownership";
import { RoadSection } from "./road-section";

export type { SerializedRoadSectionPass } from './line-path';

export interface SerializedLine {
  n: string;                     // name
  c: string;                     // color (hex)
  l: boolean;                    // isCircular
  p: SerializedRoadSectionPass[]; // paths
  g: string | null;              // figmaGroupId
}

export interface LineProps {
  name: string;
  color: string;
  isCircular: boolean;
  paths: Owned<RoadSectionPass>[];
  figmaGroupId: string | null;
}

export class Line extends TransportationMapObject<LineId> {
  name!: string;
  color!: string;
  isCircular!: boolean;
  private _paths!: Owned<RoadSectionPass>[];
  figmaGroupId!: string | null;

  get paths(): RoadSectionPass[] {
    return this._paths;
  }

  set paths(paths: RoadSectionPass[]) {
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
    // The serialized form only carries real stops (see RoadSectionPass.serialize) —
    // pass-through candidates need regenerating right after load.
    this._paths = validateLinePaths(this);
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

  replacePaths(paths: RoadSectionPassData[]): void {
    this._paths = linePathsFromData(this.mapState, paths);
    this._paths = validateLinePaths(this);
  }

  // Splices a chain of new passes in at `boundaryIndex` (0..passes.length inclusive —
  // `i` means "insert before passes[i]"; passes.length means append at the end). This
  // is the only way a path grows now. Pure splice: neighboring passes are never
  // mutated, since every pass's section/direction/stops are entirely self-contained.
  insertPassesAt(boundaryIndex: number, passes: RoadSectionPass[]): void {
    this._paths.splice(boundaryIndex, 0, ...passes.map(p => own(p)));
    this._paths = validateLinePaths(this);
  }

  removePassAt(passIndex: number): void {
    this._paths.splice(passIndex, 1);
    this._paths = validateLinePaths(this);
  }

  // "Removing" a real stop just demotes it back to an (unchecked) pass-through
  // candidate — every station in a pass's section always has an entry, real or not.
  removeStopAt(passIndex: number, stationId: StationId): void {
    const stop = this.paths[passIndex]?.stops.find(s => s.station.id === stationId);
    if (stop) stop.stops = false;
    this._paths = validateLinePaths(this);
  }

  setStopFlag(passIndex: number, stationId: StationId, stops: boolean): void {
    const stop = this.paths[passIndex]?.stops.find(s => s.station.id === stationId);
    if (stop) stop.stops = stops;
  }

  // Counts the number of directed runs a line makes on a section — trivial now,
  // since a RoadSectionPass already IS one directed run through a section.
  countPassesOnSection(section: RoadSection): number {
    return this.paths.filter(p => p.section === section).length;
  }

  // Rotates the path's passes by `steps` — used to change a circular line's start point.
  rotatePasses(steps: number): void {
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
