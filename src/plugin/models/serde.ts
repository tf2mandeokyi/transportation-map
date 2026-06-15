import { HVAlign, LineId, NodeId, RoadId, RoadSectionId, StationId } from "@/common/types";
import { Connection, Line, LinePath, MapState, Node, Road, RoadSection, Station } from "./structures";

interface SerializedConnection {
  ep: { x: number; y: number };  // endpointPos (absolute)
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
  bmp: { x: number; y: number }; // bezierMidPoint
  e0: SerializedConnection; // endpoints[0]
  e1: SerializedConnection; // endpoints[1]
  sec: SerializedRoadSection[]; // sections
}

interface SerializedNode {
  i: string; // id
  n?: string; // name
  ip?: { x: number; y: number }; // isolatedPos
  rc: Array<{ r: string; e: 0 | 1 }>; // roadConnections
}

interface SerializedStation {
  i: string; // id
  n: string; // name
  f: string | null; // figmaNodeId
  t: HVAlign; // textAlign
  ta?: 'left' | 'center' | 'right'; // textHAlign (absent in old saves → defaults to 'left')
  tr?: number; // textRotation (absent in old saves → defaults to 0)
  it: number; // interpT
  rs: string | null; // roadSectionId
}

interface SerializedLinePath {
  k: 'ss' | 're';
  x: number;
  id?: string;  // 'ss': stationId; 're' legacy: old roadSectionId (ignored on load)
  r?: number;   // 'ss': rank (absent = 0)
  s?: string;   // 're': sourceRoadId
  n?: string;   // 're': nodeId
  d?: string;   // 're': destRoadId
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
  return { ep: c.endpointPos, g: c.groupNumber };
}

function deserializeConnection(s: SerializedConnection): Connection {
  return {
    endpointPos: s.ep,
    groupNumber: s.g,
  };
}

export function serializeMapState(state: MapState): string {
  const nodes: SerializedNode[] = Array.from(state.nodes.values()).map(n => ({
    i: n.id,
    n: n.name,
    ip: n.isolatedPos,
    rc: n.roadConnections.map(rc => ({ r: rc.roadId, e: rc.endpointIndex }))
  }));

  const roads: SerializedRoad[] = Array.from(state.roads.values()).map(r => ({
    i: r.id,
    n: r.name,
    sn: r.startNodeId,
    en: r.endNodeId,
    bmp: r.bezierMidPoint,
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
    ta: s.textHAlign,
    tr: s.textRotation,
    it: s.interpT,
    rs: s.roadSectionId
  }));

  const lines: SerializedLine[] = Array.from(state.lines.values()).map(l => ({
    i: l.id,
    n: l.name,
    c: l.color,
    ci: l.isCircular,
    p: l.paths.map(p => p.kind === 'station-stop'
      ? { k: 'ss' as const, x: p.index, id: p.stationId, r: p.rank || undefined }
      : { k: 're' as const, x: p.index, s: p.sourceRoadId, n: p.nodeId, d: p.destRoadId }
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

type LegacyRaw = Record<string, unknown>;
type Vec2 = { x: number; y: number };

// Migrates in-place from legacy formats:
// v1: node.pos + relative displacements → absolute endpointPos/bezierPos per connection
// v2: absolute bezierPos per connection → single bezierMidPoint per road
function migrateOldFormat(data: LegacyRaw): void {
  const rd = (data.rd as LegacyRaw[]) ?? [];
  const firstRoad = rd[0];
  if (!firstRoad) return;

  // v1 → v2: node.pos + relative offsets
  if (!('ep' in (firstRoad.e0 as LegacyRaw))) {
    const nodePositions = new Map<string, Vec2>();
    for (const n of (data.nd as LegacyRaw[]) ?? []) {
      if (n.p) nodePositions.set(n.i as string, n.p as Vec2);
    }
    const convertConn = (c: LegacyRaw, nodePos: Vec2) => {
      const ed = (c.ed ?? { x: 0, y: 0 }) as Vec2;
      const ep = { x: nodePos.x + ed.x, y: nodePos.y + ed.y };
      const bd = c.bd as Vec2;
      const bp = { x: ep.x + bd.x, y: ep.y + bd.y };
      return { ep, bp, g: c.g };
    };
    for (const r of rd) {
      r.e0 = convertConn(r.e0 as LegacyRaw, nodePositions.get(r.sn as string) ?? { x: 0, y: 0 });
      r.e1 = convertConn(r.e1 as LegacyRaw, nodePositions.get(r.en as string) ?? { x: 0, y: 0 });
    }
    for (const n of (data.nd as LegacyRaw[]) ?? []) delete n.p;
  }

  // v2 → v3: per-connection bezierPos → single bezierMidPoint on road
  for (const r of rd) {
    const e0 = r.e0 as LegacyRaw | undefined;
    const e1 = r.e1 as LegacyRaw | undefined;
    if (!('bmp' in r) && e0?.bp && e1?.bp) {
      const bp0 = e0.bp as Vec2;
      const bp1 = e1.bp as Vec2;
      r.bmp = { x: (bp0.x + bp1.x) / 2, y: (bp0.y + bp1.y) / 2 };
    }
    if (e0) { delete e0.bp; delete e0.bdir; }
    if (e1) { delete e1.bp; delete e1.bdir; }
  }
}

export function deserializeMapState(json: string): MapState | null {
  try {
    const data = JSON.parse(json) as LegacyRaw;
    migrateOldFormat(data);
    const typed = data as unknown as SerializedMapState;

    const nodes = new Map<NodeId, Node>();
    for (const n of typed.nd || []) {
      nodes.set(n.i as NodeId, {
        id: n.i as NodeId,
        name: n.n,
        isolatedPos: n.ip,
        roadConnections: n.rc.map(rc => ({ roadId: rc.r as RoadId, endpointIndex: rc.e }))
      });
    }

    const roads = new Map<RoadId, Road>();
    for (const r of typed.rd || []) {
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
        bezierMidPoint: r.bmp ?? { x: 0, y: 0 },
        endpoints: [deserializeConnection(r.e0), deserializeConnection(r.e1)],
        sections
      });
    }

    const stations = new Map<StationId, Station>();
    for (const s of typed.st || []) {
      stations.set(s.i as StationId, {
        id: s.i as StationId,
        name: s.n,
        figmaNodeId: s.f,
        textAlign: s.t,
        textHAlign: s.ta ?? 'left',
        textRotation: s.tr ?? 0,
        interpT: s.it,
        roadSectionId: s.rs as RoadSectionId | null
      });
    }

    const lines = new Map<LineId, Line>();
    for (const l of typed.ln || []) {
      const paths: LinePath[] = (l.p || []).flatMap((p): LinePath[] => {
        if (p.k === 'ss') {
          return [{ kind: 'station-stop', index: p.x, stationId: p.id as StationId, rank: p.r ?? 0 }];
        }
        // Old saves used a single `id` (roadSectionId); skip and let the validator regenerate.
        if (!p.s || !p.n || !p.d) return [];
        return [{ kind: 'road-section-enter', index: p.x, sourceRoadId: p.s as RoadId, nodeId: p.n as NodeId, destRoadId: p.d as RoadId }];
      });
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
      lineStackingOrder: (typed.lo || []) as LineId[]
    };
  } catch (error) {
    console.error('Failed to deserialize map state:', error);
    return null;
  }
}
