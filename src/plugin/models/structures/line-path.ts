import { RoadSection } from "./road-section";
import { Station } from "./station";
import { Node } from "./node";
import type { Road } from "./road";
import { NodeId, RoadSectionId, StationId } from "@/common/types";
import { MapState } from "./map-state";
import { LinePathInput } from "@/common/messages/line";
import { own, Owned } from "@/common/utils/ownership";

function findSharedNode(roadA: Road, roadB: Road): Node | null {
  if (roadA.endpoints[1].node === roadB.endpoints[0].node || roadA.endpoints[1].node === roadB.endpoints[1].node) return roadA.endpoints[1].node;
  if (roadA.endpoints[0].node === roadB.endpoints[0].node || roadA.endpoints[0].node === roadB.endpoints[1].node) return roadA.endpoints[0].node;
  return null;
}

export interface SerializedLinePath {
  k: 'ss' | 'sc';    // kind
  i?: StationId;     // 'ss': stationId
  r?: number;        // 'ss': rank (absent → 0)
  d?: 'a' | 'd';     // 'ss': direction (ascending/descending)
  n?: NodeId;        // 'sc': nodeId
  e?: [RoadSectionId, 0 | 1]; // 'sc': exiting sectionId
  a?: [RoadSectionId, 0 | 1]; // 'sc': entering sectionId
  f?: number;        // 'sc': exitRank (absent → 0)
  g?: number;        // 'sc': enterRank (absent → 0)
}

export type LinePath = StationStop | RoadSectionChange;

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace LinePath {
  export function fromLinePathInput(mapState: Readonly<MapState>, input: LinePathInput): Owned<LinePath> {
    if (input.kind === 'station-stop') {
      const ss = new StationStop(mapState);
      ss.station = mapState.getStation(input.stationId);
      ss.rank = 0;
      ss.stops = true;
      ss.direction = input.direction;
      return own(ss);
    }
    else {
      const rsc = new RoadSectionChange(mapState);
      rsc.node = mapState.getNode(input.nodeId);
      rsc.exiting = input.exiting
        ? { section: mapState.getRoadSection(input.exiting.sectionId), side: input.exiting.side }
        : null;
      rsc.entering = input.entering
        ? { section: mapState.getRoadSection(input.entering.sectionId), side: input.entering.side }
        : null;
      rsc.exitRank = 0;
      rsc.enterRank = 0;
      return own(rsc);
    }
  }

  export function deserialize(mapState: Readonly<MapState>, ser: SerializedLinePath): Owned<LinePath> {
    if (ser.k === 'ss') {
      if (!ser.i) throw new Error(`Serialized StationStop is missing stationId`);
      return own(new StationStop(mapState).applySerialized(ser));
    }
    else if (ser.k === 'sc') {
      if (!ser.n) throw new Error(`Serialized RoadSectionChange is missing nodeId`);
      return own(new RoadSectionChange(mapState).applySerialized(ser));
    }
    throw new Error(`Unknown line path kind: ${ser.k}`);
  }
}

export class StationStop {
  readonly kind = 'station-stop' as const;
  index: number = 0;
  mapState: Readonly<MapState>;
  station!: Station;
  rank!: number;
  stops!: boolean; // false = passes through without stopping
  direction!: 'ascending' | 'descending'; // direction of travel along the line (for sorting)

  constructor(mapState: Readonly<MapState>) {
    this.mapState = mapState;
  }

  applySerialized(ser: SerializedLinePath): this {
    if (ser.k !== 'ss') throw new Error(`Invalid serialized data for StationStop: ${JSON.stringify(ser)}`);
    if (!ser.i) throw new Error(`Serialized StationStop is missing stationId: ${JSON.stringify(ser)}`);
    this.station = this.mapState.getStation(ser.i);
    this.rank = ser.r ?? 0;
    this.stops = true; // default to true if not specified
    this.direction = ser.d === 'd' ? 'descending' : 'ascending';
    return this;
  }

  serialize(): SerializedLinePath {
    return {
      k: 'ss',
      i: this.station.id,
      r: this.rank || undefined,
      d: this.direction === 'descending' ? 'd' : 'a'
    };
  }

  autoInsertRSCTo(currStop: StationStop): Owned<RoadSectionChange> | null {
    const prevStation = this.station;
    const currStation = currStop.station;
    const prevRoad = prevStation.parent.parent;
    const currRoad = currStation.parent.parent;
    if (prevRoad === currRoad) return null;
    const node = findSharedNode(prevRoad, currRoad);
    if (!node) return null;
    const rsc = new RoadSectionChange(this.mapState);
    rsc.node = node;
    rsc.exiting = { section: prevStation.parent, side: node === prevRoad.endpoints[0].node ? 0 : 1 };
    rsc.entering = { section: currStation.parent, side: node === currRoad.endpoints[0].node ? 0 : 1 };
    rsc.exitRank = this.rank;
    rsc.enterRank = currStop.rank;
    return own(rsc);
  }
}

export class RoadSectionChange {
  readonly kind = 'road-section-change' as const;
  index: number = 0;
  mapState: Readonly<MapState>;
  node!: Node;
  exiting!: { section: RoadSection, side: 0 | 1 } | null;
  entering!: { section: RoadSection, side: 0 | 1 } | null;
  exitRank!: number;
  enterRank!: number;

  constructor(mapState: Readonly<MapState>) {
    this.mapState = mapState;
  }

  applySerialized(ser: SerializedLinePath): this {
    if (ser.k !== 'sc') throw new Error(`Invalid serialized data for RoadSectionChange: ${JSON.stringify(ser)}`);
    if (!ser.n) throw new Error(`Serialized RoadSectionChange is missing nodeId: ${JSON.stringify(ser)}`);
    this.node = this.mapState.getNode(ser.n);
    this.exiting = ser.e ? { section: this.mapState.getRoadSection(ser.e[0]), side: ser.e[1] } : null;
    this.entering = ser.a ? { section: this.mapState.getRoadSection(ser.a[0]), side: ser.a[1] } : null;
    this.exitRank = ser.f ?? 0;
    this.enterRank = ser.g ?? 0;
    return this;
  }

  serialize(): SerializedLinePath {
    return {
      k: 'sc',
      n: this.node.id,
      e: this.exiting ? [this.exiting.section.getRoadSectionId(), this.exiting.side] : undefined,
      a: this.entering ? [this.entering.section.getRoadSectionId(), this.entering.side] : undefined,
      f: this.exitRank,
      g: this.enterRank,
    };
  }
}
