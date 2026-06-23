import { LineId, NodeId, RoadSectionId, StationId } from "@/common/types";
import { IModel, LinePath, RoadSectionChange, Serializable, StationStop } from './types';

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

export class Line implements LineProps, Serializable<SerializedLine> {
  parent: IModel;
  id: LineId;
  name: string;
  color: string;
  isCircular: boolean;
  paths: LinePath[];
  figmaGroupId: string | null;

  constructor(parent: IModel, id: LineId, props: LineProps) {
    this.parent = parent;
    this.id = id;
    this.name = props.name;
    this.color = props.color;
    this.isCircular = props.isCircular;
    this.paths = props.paths;
    this.figmaGroupId = props.figmaGroupId;
  }

  getDirectionAtStop(segmentIndex: number): 'ascending' | 'descending' {
    const state = this.parent.getState();
    const currentPath = this.paths[segmentIndex];
    if (currentPath?.kind !== 'station-stop') return 'ascending';
    const current = state.stations.get(currentPath.stationId);
    if (!current) return 'ascending';

    const prev = segmentIndex > 0
      ? this.paths[segmentIndex - 1]
      : (this.isCircular ? this.paths[this.paths.length - 1] : undefined);

    if (prev?.kind === 'station-stop') {
      const prevStation = state.stations.get(prev.stationId);
      if (prevStation) return prevStation.interpT < current.interpT ? 'ascending' : 'descending';
    }

    if (prev?.kind === 'road-section-change') {
      if (!prev.entering) return 'ascending';
      for (const road of state.roads.values()) {
        if (road.sections.has(prev.entering)) return prev.nodeId === road.startNodeId ? 'ascending' : 'descending';
      }
    }

    const next = this.paths[segmentIndex + 1];
    if (next?.kind === 'station-stop') {
      const nextStation = state.stations.get(next.stationId);
      if (nextStation) return current.interpT < nextStation.interpT ? 'ascending' : 'descending';
    }
    if (next?.kind === 'road-section-change') {
      if (!current.roadSectionId) return 'ascending';
      for (const road of state.roads.values()) {
        if (road.sections.has(current.roadSectionId)) return next.nodeId === road.endNodeId ? 'ascending' : 'descending';
      }
      return 'ascending';
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
          return [{ k: 'ss', x: path.index, i: path.stationId, r: path.rank || undefined }];
        }
        return [{ k: 'sc', x: path.index, n: path.nodeId, e: path.exiting ?? undefined, a: path.entering ?? undefined, f: path.exitRank || undefined, g: path.enterRank || undefined }];
      }),
      g: this.figmaGroupId,
    };
  }

  static deserialize(ser: SerializedLine, parent: IModel): Line {
    const paths: LinePath[] = (ser.p || []).flatMap((p): LinePath[] => {
      if (p.k === 'ss') {
        return [{ kind: 'station-stop', index: p.x, stationId: p.i as StationId, rank: p.r ?? 0, stops: true }];
      }
      if (p.k === 'sc') {
        if (!p.n) return [];
        return [{ kind: 'road-section-change', index: p.x, nodeId: p.n as NodeId, exiting: (p.e ?? null) as RoadSectionId | null, entering: (p.a ?? null) as RoadSectionId | null, exitRank: p.f ?? 0, enterRank: p.g ?? 0 }];
      }
      return [];
    });
    return new Line(parent, ser.i as LineId, {
      name: ser.n,
      color: ser.c,
      isCircular: ser.l,
      paths,
      figmaGroupId: ser.g ?? null,
    });
  }
}

// Re-export path types so callers importing from Line's file get the full picture.
export type { LinePath, StationStop, RoadSectionChange };
