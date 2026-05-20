import { HVAlign, LineId, NodeId, RoadId, RoadSectionId, StationId } from "@/common/types";
import { Connection, Line, LinePath, MapState, Node, Road, RoadSection, RoadSectionEnter, Station, StationStop } from "./structures";

interface SerializedConnection {
  bd: { x: number; y: number }; // bezierDisplacement
  bdir: { x: number; y: number }; // bezierDirection
  g: number; // groupNumber
}

interface SerializedRoadSection {
  i: string; // id
  n?: string; // name
  x: number; // index
  s: string[]; // stationIds
}

interface SerializedRoad {
  i: string; // id
  n?: string; // name
  sn: string; // startNodeId
  en: string; // endNodeId
  e0: SerializedConnection; // endpoints[0]
  e1: SerializedConnection; // endpoints[1]
  sec: SerializedRoadSection[]; // sections
}

interface SerializedNode {
  i: string; // id
  n?: string; // name
  p: { x: number; y: number }; // pos
  rc: Array<{ r: string; e: 0 | 1 }>; // roadConnections
}

interface SerializedStation {
  i: string; // id
  n: string; // name
  f: string | null; // figmaNodeId
  t: HVAlign; // textAlign
  it: number; // interpT
  rs: string | null; // roadSectionId
}

interface SerializedLinePath {
  k: 'ss' | 're'; // kind: station-stop or road-section-enter
  x: number; // index
  id: string; // stationId or roadSectionId
}

interface SerializedLine {
  i: string; // id
  n: string; // name
  c: string; // color (hex)
  ci: boolean; // isCircular
  p: SerializedLinePath[]; // paths
  g: string | null; // figmaGroupId
}

interface SerializedMapState {
  nd: SerializedNode[]; // nodes
  rd: SerializedRoad[]; // roads
  st: SerializedStation[]; // stations
  ln: SerializedLine[]; // lines
  lo: string[]; // lineStackingOrder
}

function serializeConnection(c: Connection): SerializedConnection {
  return { bd: c.bezierDisplacement, bdir: c.bezierDirection, g: c.groupNumber };
}

function deserializeConnection(s: SerializedConnection): Connection {
  return { bezierDisplacement: s.bd, bezierDirection: s.bdir, groupNumber: s.g };
}

export function serializeMapState(state: MapState): string {
  const nodes: SerializedNode[] = Array.from(state.nodes.values()).map(n => ({
    i: n.id,
    n: n.name,
    p: n.pos,
    rc: n.roadConnections.map(rc => ({ r: rc.roadId, e: rc.endpointIndex }))
  }));

  const roads: SerializedRoad[] = Array.from(state.roads.values()).map(r => ({
    i: r.id,
    n: r.name,
    sn: r.startNodeId,
    en: r.endNodeId,
    e0: serializeConnection(r.endpoints[0]),
    e1: serializeConnection(r.endpoints[1]),
    sec: Array.from(r.sections.values()).map(sec => ({
      i: sec.id,
      n: sec.name,
      x: sec.index,
      s: sec.stationIds
    }))
  }));

  const stations: SerializedStation[] = Array.from(state.stations.values()).map(s => ({
    i: s.id,
    n: s.name,
    f: s.figmaNodeId,
    t: s.textAlign,
    it: s.interpT,
    rs: s.roadSectionId
  }));

  const lines: SerializedLine[] = Array.from(state.lines.values()).map(l => ({
    i: l.id,
    n: l.name,
    c: l.color,
    ci: l.isCircular,
    p: l.paths.map(p => p.kind === 'station-stop'
      ? { k: 'ss' as const, x: p.index, id: p.stationId }
      : { k: 're' as const, x: p.index, id: p.roadSectionId }
    ),
    g: l.figmaGroupId
  }));

  const serialized: SerializedMapState = {
    nd: nodes,
    rd: roads,
    st: stations,
    ln: lines,
    lo: state.lineStackingOrder
  };

  return JSON.stringify(serialized);
}

export function deserializeMapState(json: string): MapState | null {
  try {
    const data: SerializedMapState = JSON.parse(json);

    const nodes = new Map<NodeId, Node>();
    for (const n of data.nd || []) {
      nodes.set(n.i as NodeId, {
        id: n.i as NodeId,
        name: n.n,
        pos: n.p,
        roadConnections: n.rc.map(rc => ({ roadId: rc.r as RoadId, endpointIndex: rc.e }))
      });
    }

    const roads = new Map<RoadId, Road>();
    for (const r of data.rd || []) {
      const sections = new Map<RoadSectionId, RoadSection>();
      for (const sec of r.sec || []) {
        sections.set(sec.i as RoadSectionId, {
          id: sec.i as RoadSectionId,
          name: sec.n,
          index: sec.x,
          stationIds: (sec.s || []) as StationId[]
        });
      }
      roads.set(r.i as RoadId, {
        id: r.i as RoadId,
        name: r.n,
        startNodeId: r.sn as NodeId,
        endNodeId: r.en as NodeId,
        endpoints: [deserializeConnection(r.e0), deserializeConnection(r.e1)],
        sections
      });
    }

    const stations = new Map<StationId, Station>();
    for (const s of data.st || []) {
      stations.set(s.i as StationId, {
        id: s.i as StationId,
        name: s.n,
        figmaNodeId: s.f,
        textAlign: s.t,
        interpT: s.it,
        roadSectionId: s.rs as RoadSectionId | null
      });
    }

    const lines = new Map<LineId, Line>();
    for (const l of data.ln || []) {
      const paths: LinePath[] = (l.p || []).map(p => p.k === 'ss'
        ? { kind: 'station-stop', index: p.x, stationId: p.id as StationId } as StationStop
        : { kind: 'road-section-enter', index: p.x, roadSectionId: p.id as RoadSectionId } as RoadSectionEnter
      );
      lines.set(l.i as LineId, {
        id: l.i as LineId,
        name: l.n,
        color: l.c,
        isCircular: l.ci,
        paths,
        figmaGroupId: l.g ?? null
      });
    }

    return {
      nodes,
      roads,
      stations,
      lines,
      lineStackingOrder: (data.lo || []) as LineId[]
    };
  } catch (error) {
    console.error('Failed to deserialize map state:', error);
    return null;
  }
}
