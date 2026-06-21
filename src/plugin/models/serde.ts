import { HVAlign, LineId, NodeId, RoadId, RoadSectionId, StationId } from "@/common/types";
import { Connection, Line, LinePath, MapState, Node, Road, RoadSection, Station } from "./structures";

interface SerializedConnection {
  p: { x: number; y: number };  // endpointPos
  g: number;                    // groupNumber
}

interface SerializedRoadSection {
  i: string;    // id
  n?: string;   // name
  x: number;    // index
  s: string[];  // stationIds
}

interface SerializedRoad {
  i: string;                                     // id
  n?: string;                                    // name
  s: string;                                     // startNodeId
  e: string;                                     // endNodeId
  b: { x: number; y: number };                  // bezierMidPoint
  p: [SerializedConnection, SerializedConnection]; // endpoints
  c: SerializedRoadSection[];                    // sections
}

interface SerializedNode {
  i: string;                          // id
  n?: string;                         // name
  p?: { x: number; y: number };       // isolatedPos
  r: Array<{ r: string; e: 0 | 1 }>; // roadConnections
}

interface SerializedStation {
  i: string;                          // id
  n: string;                          // name
  f: string | null;                   // figmaNodeId
  t: HVAlign;                         // textAlign
  h?: 'left' | 'center' | 'right';   // textHAlign (absent → 'left')
  r?: number;                         // textRotation (absent → 0)
  l?: boolean;                        // flipped (absent → false)
  p: number;                          // interpT
  s: string | null;                   // roadSectionId
}

interface SerializedLinePath {
  k: 'ss' | 'sc';  // kind
  x: number;        // index
  i?: string;       // 'ss': stationId
  r?: number;       // 'ss': rank (absent → 0)
  n?: string;       // 'sc': nodeId
  e?: string;       // 'sc': exiting sectionId
  a?: string;       // 'sc': entering sectionId
}

interface SerializedLine {
  i: string;               // id
  n: string;               // name
  c: string;               // color (hex)
  l: boolean;              // isCircular
  p: SerializedLinePath[]; // paths
  g: string | null;        // figmaGroupId
}

interface SerializedMapState {
  n: SerializedNode[];
  r: SerializedRoad[];
  s: SerializedStation[];
  l: SerializedLine[];
  o: string[]; // lineStackingOrder
}

function serializeConnection(c: Connection): SerializedConnection {
  return { p: c.endpointPos, g: c.groupNumber };
}

function deserializeConnection(c: SerializedConnection): Connection {
  return { endpointPos: c.p, groupNumber: c.g };
}

export function serializeMapState(state: MapState): string {
  const nodes: SerializedNode[] = Array.from(state.nodes.values()).map(node => ({
    i: node.id,
    n: node.name,
    p: node.isolatedPos,
    r: node.roadConnections.map(rc => ({ r: rc.roadId, e: rc.endpointIndex })),
  }));

  const roads: SerializedRoad[] = Array.from(state.roads.values()).map(road => ({
    i: road.id,
    n: road.name,
    s: road.startNodeId,
    e: road.endNodeId,
    b: road.bezierMidPoint,
    p: [serializeConnection(road.endpoints[0]), serializeConnection(road.endpoints[1])],
    c: Array.from(road.sections.values()).map(sec => ({
      i: sec.id,
      n: sec.name,
      x: sec.index,
      s: sec.stationIds,
    })),
  }));

  const stations: SerializedStation[] = Array.from(state.stations.values()).map(station => ({
    i: station.id,
    n: station.name,
    f: station.figmaNodeId,
    t: station.textAlign,
    h: station.textHAlign,
    r: station.textRotation || undefined,
    l: station.flipped || undefined,
    p: station.interpT,
    s: station.roadSectionId,
  }));

  const lines: SerializedLine[] = Array.from(state.lines.values()).map(line => ({
    i: line.id,
    n: line.name,
    c: line.color,
    l: line.isCircular,
    p: line.paths.flatMap((path): SerializedLinePath[] => {
      if (path.kind === 'station-stop') {
        if (!path.stops) return [];
        return [{ k: 'ss', x: path.index, i: path.stationId, r: path.rank || undefined }];
      }
      return [{ k: 'sc', x: path.index, n: path.nodeId, e: path.exiting ?? undefined, a: path.entering ?? undefined }];
    }),
    g: line.figmaGroupId,
  }));

  return JSON.stringify({ n: nodes, r: roads, s: stations, l: lines, o: state.lineStackingOrder });
}

export function deserializeMapState(json: string): MapState | null {
  try {
    const data = JSON.parse(json) as SerializedMapState;

    const nodes = new Map<NodeId, Node>();
    for (const node of data.n || []) {
      nodes.set(node.i as NodeId, {
        id: node.i as NodeId,
        name: node.n,
        isolatedPos: node.p,
        roadConnections: node.r.map(rc => ({ roadId: rc.r as RoadId, endpointIndex: rc.e })),
      });
    }

    const roads = new Map<RoadId, Road>();
    for (const road of data.r || []) {
      const sections = new Map<RoadSectionId, RoadSection>();
      for (const sec of road.c || []) {
        sections.set(sec.i as RoadSectionId, {
          id: sec.i as RoadSectionId,
          name: sec.n,
          index: sec.x,
          stationIds: (sec.s || []) as StationId[],
        });
      }
      roads.set(road.i as RoadId, {
        id: road.i as RoadId,
        name: road.n,
        startNodeId: road.s as NodeId,
        endNodeId: road.e as NodeId,
        bezierMidPoint: road.b,
        endpoints: [deserializeConnection(road.p[0]), deserializeConnection(road.p[1])],
        sections,
      });
    }

    const stations = new Map<StationId, Station>();
    for (const station of data.s || []) {
      stations.set(station.i as StationId, {
        id: station.i as StationId,
        name: station.n,
        figmaNodeId: station.f,
        textAlign: station.t,
        textHAlign: station.h ?? 'left',
        textRotation: station.r ?? 0,
        flipped: station.l ?? false,
        interpT: station.p,
        roadSectionId: station.s as RoadSectionId | null,
      });
    }

    const lines = new Map<LineId, Line>();
    for (const line of data.l || []) {
      const paths: LinePath[] = (line.p || []).flatMap((p): LinePath[] => {
        if (p.k === 'ss') {
          return [{ kind: 'station-stop', index: p.x, stationId: p.i as StationId, rank: p.r ?? 0, stops: true }];
        }
        if (p.k === 'sc') {
          if (!p.n) return [];
          return [{ kind: 'road-section-change' as const, index: p.x, nodeId: p.n as NodeId, exiting: (p.e ?? null) as RoadSectionId | null, entering: (p.a ?? null) as RoadSectionId | null }];
        }
        return [];
      });
      lines.set(line.i as LineId, {
        id: line.i as LineId,
        name: line.n,
        color: line.c,
        isCircular: line.l,
        paths,
        figmaGroupId: line.g ?? null,
      });
    }

    return { nodes, roads, stations, lines, lineStackingOrder: (data.o || []) as LineId[] };
  } catch (error) {
    console.error('Failed to deserialize map state:', error);
    return null;
  }
}
