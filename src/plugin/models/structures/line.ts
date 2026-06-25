import { LineId } from "@/common/types";
import { LinePathInput } from "@/common/messages";
import { MapState } from './map-state';
import { LinePath, SerializedLinePath, StationStop } from './line-path';
import { validateLinePaths } from '../../utils/line-validator';
import { TransportationMapObject } from "./types";
import { Owned } from "@/common/utils/ownership";

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

  addPath(path: LinePathInput): void {
    this.paths.push(LinePath.fromLinePathInput(this.mapState, path));
    this.paths = validateLinePaths(this);
  }

  replacePaths(paths: LinePathInput[]): void {
    const newPaths: Owned<LinePath>[] = [];
    for (let i = 0; i < paths.length; i++) {
      const p = paths[i];
      const linePath = LinePath.fromLinePathInput(this.mapState, p);
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
    const path = this.paths.find(p => p.index !== pathIndex);
    if (!path || !(path instanceof StationStop)) return;
    if (stops) {
      path.stops = true;
      this.paths = validateLinePaths(this);
    } else {
      this.paths = this.paths.filter(p => p.index !== pathIndex);
      this.paths.forEach((p, i) => { p.index = i; });
      this.paths = validateLinePaths(this);
    }
  }

  static deserialize(mapState: Readonly<MapState>, id: LineId, ser: SerializedLine): Line {
    return new Line(mapState, id).applySerialized(ser);
  }
}
