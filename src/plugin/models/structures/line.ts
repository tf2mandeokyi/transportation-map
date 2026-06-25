import { LineId, RoadSectionId, StationId } from "@/common/types";
import { LinePathInput } from "@/common/messages";
import { MapState } from './map-state';
import { LinePath, RoadSectionChange, SerializedLinePath, StationStop } from './line-path';
import type { RoadSection } from './road-section';
import { validateLinePaths } from '../../utils/line-validator';
import { TransportationMapObject } from "./types";

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
  paths: LinePath[];
  figmaGroupId: string | null;
}

export class Line extends TransportationMapObject<LineId> {
  name!: string;
  color!: string;
  isCircular!: boolean;
  paths!: LinePath[];
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

  getDirectionAtStop(segmentIndex: number): 'ascending' | 'descending' {
    const currentPath = this.paths[segmentIndex];
    if (!(currentPath instanceof StationStop)) return 'ascending';
    const current = currentPath.station;

    const prev = segmentIndex > 0
      ? this.paths[segmentIndex - 1]
      : (this.isCircular ? this.paths[this.paths.length - 1] : undefined);

    if (prev instanceof StationStop) {
      const prevStation = prev.station;
      return prevStation.interpT < current.interpT ? 'ascending' : 'descending';
    }

    if (prev instanceof RoadSectionChange) {
      if (!prev.entering) return 'ascending';
      const road = prev.entering.section.parent;
      return prev.node === road.endpoints[0].node ? 'ascending' : 'descending';
    }

    const next = this.paths[segmentIndex + 1];
    if (next instanceof StationStop) {
      const nextStation = next.station;
      return current.interpT < nextStation.interpT ? 'ascending' : 'descending';
    }
    if (next instanceof RoadSectionChange) {
      const section = current.parent;
      if (!section) return 'ascending';
      const road = section.parent;
      return next.node === road.endpoints[1].node ? 'ascending' : 'descending';
    }

    return 'ascending';
  }

  addPath(path: LinePathInput): void {
    this.paths.push(LinePath.fromLinePathInput(this.mapState, path));
    this.paths = validateLinePaths(this);
  }

  private _findSection(sectionId: RoadSectionId, state: Readonly<MapState>): RoadSection | null {
    try { return state.getRoadSection(sectionId); }
    catch { return null; }
  }

  replacePaths(paths: LinePathInput[]): void {
    const state = this.mapState;
    const existingStationRanks = new Map<StationId, number>();
    const existingRscRanks = new Map<string, { exitRank: number; enterRank: number }>();
    for (const p of this.paths) {
      if (p instanceof StationStop) {
        existingStationRanks.set(p.station.id, p.rank);
      } else if (p instanceof RoadSectionChange) {
        existingRscRanks.set(
          `${p.node.id}:${p.exiting?.section.id ?? 'null'}:${p.entering?.section.id ?? 'null'}`,
          { exitRank: p.exitRank, enterRank: p.enterRank }
        );
      }
    }
    const newPaths: LinePath[] = [];
    for (let i = 0; i < paths.length; i++) {
      const p = paths[i];
      if (p.kind === 'station-stop') {
        let station;
        try { station = state.getStation(p.stationId); } catch { continue; }
        const stopPath = new StationStop(this.mapState).applyProps({
          station,
          rank: existingStationRanks.get(p.stationId) ?? 0,
          stops: true,
        });
        stopPath.index = i;
        newPaths.push(stopPath);
      } else {
        let node;
        try { node = state.getNode(p.nodeId); } catch { continue; }
        const exitingSection = p.exiting ? this._findSection(p.exiting.sectionId, state) : null;
        const enteringSection = p.entering ? this._findSection(p.entering.sectionId, state) : null;
        const exiting = exitingSection && p.exiting ? { section: exitingSection, side: p.exiting.side } : null;
        const entering = enteringSection && p.entering ? { section: enteringSection, side: p.entering.side } : null;
        const existing = existingRscRanks.get(
          `${p.nodeId}:${p.exiting?.sectionId ?? 'null'}:${p.entering?.sectionId ?? 'null'}`
        );
        const rscPath = new RoadSectionChange(this.mapState).applyProps({
          node,
          exiting,
          entering,
          exitRank: existing?.exitRank ?? 0,
          enterRank: existing?.enterRank ?? 0,
        });
        rscPath.index = i;
        newPaths.push(rscPath);
      }
    }
    this.paths = newPaths;
    this.paths = validateLinePaths(this);
  }

  removePath(pathIndex: number): void {
    this.paths = this.paths.filter(p => p.index !== pathIndex);
    this._reindexPaths();
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
      this._reindexPaths();
      this.paths = validateLinePaths(this);
    }
  }

  private _reindexPaths(): void {
    this.paths.forEach((p, i) => { p.index = i; });
  }

  static deserialize(mapState: Readonly<MapState>, id: LineId, ser: SerializedLine): Line {
    return new Line(mapState, id).applySerialized(ser);
  }
}
