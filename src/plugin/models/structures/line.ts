import { LineId, NodeId, RoadSectionId, StationId } from "@/common/types";
import { IModel, LinePath, RoadSectionChange, Serializable, StationStop } from './types';
import type { Node } from './node';
import type { RoadSection } from './road-section';
import type { Station } from './station';

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
      return prev.node.id === road.startNode.id ? 'ascending' : 'descending';
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
      return next.node.id === road.endNode.id ? 'ascending' : 'descending';
    }

    return 'ascending';
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
