import { LineId, NodeId, RoadId, StationId } from "@/common/types";
import { IModel, MapState } from '../structures/types';
import { Node } from '../structures/node';
import { Road } from '../structures/road';
import { Station } from '../structures/station';
import { Line } from '../structures/line';

export function serializeMapState(state: MapState): string {
  return JSON.stringify({
    n: Array.from(state.nodes.values()).map(n => n.serialize()),
    r: Array.from(state.roads.values()).map(r => r.serialize()),
    s: Array.from(state.stations.values()).map(s => s.serialize()),
    l: Array.from(state.lines.values()).map(l => l.serialize()),
    o: state.lineStackingOrder,
  });
}

export function deserializeMapState(json: string, parent: IModel): MapState | null {
  try {
    const data = JSON.parse(json);

    const nodes = new Map<NodeId, Node>();
    for (const n of data.n || []) {
      const node = Node.deserialize(n, parent);
      nodes.set(node.id, node);
    }

    const roads = new Map<RoadId, Road>();
    for (const r of data.r || []) {
      const road = Road.deserialize(r, parent);
      roads.set(road.id, road);
    }

    const stations = new Map<StationId, Station>();
    for (const s of data.s || []) {
      const station = Station.deserialize(s, parent);
      stations.set(station.id, station);
    }

    const lines = new Map<LineId, Line>();
    for (const l of data.l || []) {
      const line = Line.deserialize(l, parent);
      lines.set(line.id, line);
    }

    return { nodes, roads, stations, lines, lineStackingOrder: (data.o || []) as LineId[] };
  } catch (error) {
    console.error('Failed to deserialize map state:', error);
    return null;
  }
}
