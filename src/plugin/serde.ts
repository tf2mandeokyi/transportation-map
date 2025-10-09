import { LineId, StationId, StationOrientation } from "../common/types";
import { Line, LineStopInfo, MapState, Station } from "./structures";

// Serialized format with abbreviated keys to save space (100KB limit)
interface SerializedStation {
  i: string;              // id
  n: string;              // name
  f: string | null;       // figmaNodeId
  p: { x: number; y: number }; // position
  h: boolean;             // hidden
  o: StationOrientation;  // orientation
  l: [string, boolean][]; // lines: [lineId, stopsAt][]
}

interface SerializedLine {
  i: string;              // id
  n: string;              // name
  c: RGB;                 // color
  p: string[];            // path (stationIds)
}

interface SerializedMapState {
  s: SerializedStation[]; // stations
  l: SerializedLine[];    // lines
  o: string[];            // lineStackingOrder
  r: boolean;             // rightHandTraffic
}

export function serializeMapState(state: MapState, rightHandTraffic: boolean): string {
  const stations: SerializedStation[] = Array.from(state.stations.values()).map(station => ({
    i: station.id,
    n: station.name,
    f: station.figmaNodeId,
    p: station.position,
    h: station.hidden,
    o: station.orientation,
    l: Array.from(station.lines.entries()).map(([lineId, info]) => [lineId, info.stopsAt])
  }));

  const lines: SerializedLine[] = Array.from(state.lines.values()).map(line => ({
    i: line.id,
    n: line.name,
    c: line.color,
    p: line.path
  }));

  const serialized: SerializedMapState = {
    s: stations,
    l: lines,
    o: state.lineStackingOrder,
    r: rightHandTraffic
  };

  return JSON.stringify(serialized);
}

export function deserializeMapState(json: string): { state: MapState; rightHandTraffic: boolean } | null {
  try {
    const data: SerializedMapState = JSON.parse(json);

    // Deserialize stations
    const stations = new Map<StationId, Station>();
    for (const s of data.s || []) {
      const lines = new Map<LineId, LineStopInfo>();
      for (const [lineId, stopsAt] of s.l) {
        lines.set(lineId as LineId, { stopsAt });
      }

      stations.set(s.i as StationId, {
        id: s.i as StationId,
        name: s.n,
        figmaNodeId: s.f,
        position: s.p,
        hidden: s.h,
        orientation: s.o,
        lines
      });
    }

    // Deserialize lines
    const lines = new Map<LineId, Line>();
    for (const l of data.l || []) {
      lines.set(l.i as LineId, {
        id: l.i as LineId,
        name: l.n,
        color: l.c,
        path: l.p as StationId[]
      });
    }

    return {
      state: {
        stations,
        lines,
        lineStackingOrder: (data.o || []) as LineId[]
      },
      rightHandTraffic: data.r ?? true
    };
  } catch (error) {
    console.error('Failed to deserialize map state:', error);
    return null;
  }
}
