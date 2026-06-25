import { LineId, NodeId, SectionId, StationId, RoadId } from "@/common/types";
import { MapState, Node, SerializedNode, Road, SerializedRoad, RoadSection, Station, SerializedStation, Line, SerializedLine } from "../structures";
import { own } from "@/common/utils/ownership";

export function serializeMapState(state: MapState): string {
  const n: Record<string, SerializedNode> = {};
  for (const node of state.getNodes()) n[node.id] = node.serialize();

  const r: Record<string, SerializedRoad> = {};
  for (const road of state.getRoads()) r[road.id] = road.serialize();

  const s: Record<string, SerializedStation> = {};
  for (const station of state.getStations()) s[station.id] = station.serialize();

  const l: Record<string, SerializedLine> = {};
  for (const line of state.getLines()) l[line.id] = line.serialize();

  return JSON.stringify({ n, r, s, l });
}

export function deserializeMapState(json: string, state: MapState): boolean {
  try {
    const data = JSON.parse(json);

    // Phase 1: create bare node instances
    for (const id of Object.keys(data.n || {})) {
      state.addNode(own(new Node(state, id as NodeId)));
    }

    // Phase 2: create bare road + section instances
    for (const [id, ser] of Object.entries(data.r || {})) {
      const road = own(new Road(state, id as RoadId));
      for (const secId of Object.keys((ser as SerializedRoad).c || {})) {
        road.addSection(own(new RoadSection(state, secId as SectionId)));
      }
      state.addRoad(road);
    }

    // Phase 3: create bare station instances
    for (const id of Object.keys(data.s || {})) {
      state.addStation(own(new Station(state, id as StationId)));
    }

    // Phase 4: apply serialized data in dependency order
    for (const [id, ser] of Object.entries(data.n || {})) {
      state.getNodeHarsh(id as NodeId).applySerialized(ser as SerializedNode);
    }
    // Road.applySerialized also applies sections (which set station parents via setParent)
    for (const [id, ser] of Object.entries(data.r || {})) {
      state.getRoadHarsh(id as RoadId).applySerialized(ser as SerializedRoad);
    }
    for (const [id, ser] of Object.entries(data.s || {})) {
      const station = state.getStationHarsh(id as StationId);
      station.applySerialized(ser as SerializedStation);
      station.figmaNodeId = (ser as SerializedStation).f;
    }
    for (const [id, ser] of Object.entries(data.l || {})) {
      state.addLine(own(new Line(state, id as LineId).applySerialized(ser as SerializedLine)));
    }

    return true;
  } catch (error) {
    console.error('Failed to deserialize map state:', error);
    return false;
  }
}
