import { LineId, NodeId, RoadSectionId, StationId } from "@/common/types";
import { LinePathInput } from "@/common/messages";
import { IModel, LinePath, MapState, RoadSectionChange, Serializable, StationStop } from './types';
import type { Node } from './node';
import type { RoadSection } from './road-section';
import type { Station } from './station';
import { getStationStopsAcrossLines, getRscEntriesForNode } from '../../utils/line-queries';
import { validateLinePaths } from '../../utils/line-validator';

export interface SerializedLinePath {
  k: 'ss' | 'sc'; // kind
  x: number;       // index
  i?: string;      // 'ss': stationId
  r?: number;      // 'ss': rank (absent → 0)
  n?: string;      // 'sc': nodeId
  e?: string;      // 'sc': exiting sectionId
  a?: string;      // 'sc': entering sectionId
  f?: number;      // 'sc': exitRank (absent → 0)
  g?: number;      // 'sc': enterRank (absent → 0)
}

export interface SerializedLine {
  i: string;               // id
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

export class Line implements Serializable<SerializedLine> {
  parent: IModel;
  id: LineId;
  name: string;
  color: string;
  isCircular: boolean;
  paths: LinePath[];
  figmaGroupId: string | null;
  private _rawPaths: SerializedLinePath[] = [];

  constructor(parent: IModel, id: LineId, props: { name: string; color: string; isCircular: boolean; paths?: LinePath[]; figmaGroupId?: string | null }) {
    this.parent = parent;
    this.id = id;
    this.name = props.name;
    this.color = props.color;
    this.isCircular = props.isCircular;
    this.paths = props.paths ?? [];
    this.figmaGroupId = props.figmaGroupId ?? null;
  }

  getDirectionAtStop(segmentIndex: number): 'ascending' | 'descending' {
    const currentPath = this.paths[segmentIndex];
    if (currentPath?.kind !== 'station-stop') return 'ascending';
    const current = currentPath.station;

    const prev = segmentIndex > 0
      ? this.paths[segmentIndex - 1]
      : (this.isCircular ? this.paths[this.paths.length - 1] : undefined);

    if (prev?.kind === 'station-stop') {
      const prevStation = prev.station;
      return prevStation.interpT < current.interpT ? 'ascending' : 'descending';
    }

    if (prev?.kind === 'road-section-change') {
      if (!prev.entering) return 'ascending';
      const road = prev.entering.road;
      return prev.node === road.startNode ? 'ascending' : 'descending';
    }

    const next = this.paths[segmentIndex + 1];
    if (next?.kind === 'station-stop') {
      const nextStation = next.station;
      return current.interpT < nextStation.interpT ? 'ascending' : 'descending';
    }
    if (next?.kind === 'road-section-change') {
      const section = current.roadSection;
      if (!section) return 'ascending';
      const road = section.road;
      return next.node === road.endNode ? 'ascending' : 'descending';
    }

    return 'ascending';
  }

  addPath(path: LinePathInput): void {
    const state = this.parent.getState();
    const index = this.paths.length;
    if (path.kind === 'station-stop') {
      const station = state.stations.get(path.stationId);
      if (!station) return;
      this.paths.push({ kind: 'station-stop', index, station, rank: this._nextRankForStation(station, state), stops: true });
    } else {
      const node = state.nodes.get(path.nodeId);
      if (!node) return;
      const exiting = path.exiting ? this._findSection(path.exiting, state) : null;
      const entering = path.entering ? this._findSection(path.entering, state) : null;
      this.paths.push({ kind: 'road-section-change', index, node, exiting, entering,
        exitRank: this._nextRankForSection(node, exiting, state),
        enterRank: this._nextRankForSection(node, entering, state),
      });
    }
    this.paths = validateLinePaths(this);
  }

  private _nextRankForStation(station: Station, state: Readonly<MapState>): number {
    let max = -1;
    for (const { path: p } of getStationStopsAcrossLines(station, state)) {
      if (p.stops) max = Math.max(max, p.rank);
    }
    return max + 1;
  }

  private _nextRankForSection(node: Node, section: RoadSection | null, state: Readonly<MapState>): number {
    if (!section) return 0;
    let max = -1;
    for (const { path: p } of getRscEntriesForNode(node, state)) {
      if (p.exiting === section) max = Math.max(max, p.exitRank);
      if (p.entering === section) max = Math.max(max, p.enterRank);
    }
    return max + 1;
  }

  private _findSection(sectionId: RoadSectionId, state: Readonly<MapState>): RoadSection | null {
    for (const road of state.roads.values()) {
      const section = road.sections.get(sectionId);
      if (section) return section;
    }
    return null;
  }

  replacePaths(paths: LinePathInput[]): void {
    const state = this.parent.getState();
    const existingStationRanks = new Map<StationId, number>();
    const existingRscRanks = new Map<string, { exitRank: number; enterRank: number }>();
    for (const p of this.paths) {
      if (p.kind === 'station-stop') existingStationRanks.set(p.station.id, p.rank);
      if (p.kind === 'road-section-change') {
        existingRscRanks.set(`${p.node.id}:${p.exiting?.id ?? null}:${p.entering?.id ?? null}`, { exitRank: p.exitRank, enterRank: p.enterRank });
      }
    }
    const newPaths: typeof this.paths = [];
    for (let i = 0; i < paths.length; i++) {
      const p = paths[i];
      if (p.kind === 'station-stop') {
        const station = state.stations.get(p.stationId);
        if (!station) continue;
        newPaths.push({ kind: 'station-stop', index: i, station, rank: existingStationRanks.get(p.stationId) ?? 0, stops: true });
      } else {
        const node = state.nodes.get(p.nodeId);
        if (!node) continue;
        const exiting = p.exiting ? this._findSection(p.exiting, state) : null;
        const entering = p.entering ? this._findSection(p.entering, state) : null;
        const existing = existingRscRanks.get(`${p.nodeId}:${p.exiting ?? null}:${p.entering ?? null}`);
        newPaths.push({ kind: 'road-section-change', index: i, node, exiting, entering, exitRank: existing?.exitRank ?? 0, enterRank: existing?.enterRank ?? 0 } as RoadSectionChange);
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
    const path = this.paths.find(p => p.index === pathIndex);
    if (!path || path.kind !== 'station-stop') return;
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

  serialize(): SerializedLine {
    return {
      i: this.id,
      n: this.name,
      c: this.color,
      l: this.isCircular,
      p: this.paths.flatMap((path): SerializedLinePath[] => {
        if (path.kind === 'station-stop') {
          if (!path.stops) return [];
          return [{ k: 'ss', x: path.index, i: path.station.id, r: path.rank || undefined }];
        }
        return [{ k: 'sc', x: path.index, n: path.node.id, e: path.exiting?.id ?? undefined, a: path.entering?.id ?? undefined, f: path.exitRank || undefined, g: path.enterRank || undefined }];
      }),
      g: this.figmaGroupId,
    };
  }

  resolve(
    stations: Map<StationId, Station>,
    nodes: Map<NodeId, Node>,
    sections: Map<RoadSectionId, RoadSection>,
  ): void {
    for (const p of this._rawPaths) {
      if (p.k === 'ss') {
        const station = p.i ? stations.get(p.i as StationId) : undefined;
        if (station) this.paths.push({ kind: 'station-stop', index: p.x, station, rank: p.r ?? 0, stops: true });
      } else if (p.k === 'sc') {
        if (!p.n) continue;
        const node = nodes.get(p.n as NodeId);
        if (!node) continue;
        const exiting = p.e ? (sections.get(p.e as RoadSectionId) ?? null) : null;
        const entering = p.a ? (sections.get(p.a as RoadSectionId) ?? null) : null;
        this.paths.push({ kind: 'road-section-change', index: p.x, node, exiting, entering, exitRank: p.f ?? 0, enterRank: p.g ?? 0 });
      }
    }
  }

  static deserialize(ser: SerializedLine, parent: IModel): Line {
    const line = new Line(parent, ser.i as LineId, { name: ser.n, color: ser.c, isCircular: ser.l, figmaGroupId: ser.g });
    line._rawPaths = ser.p || [];
    return line;
  }
}

// Re-export path types so callers importing from Line's file get the full picture.
export type { LinePath, StationStop, RoadSectionChange };
