import { RoadSection } from "./road-section";
import { Station } from "./station";
import { Node } from "./node";
import { NodeId, RoadSectionId, StationId } from "@/common/types";
import { MapState } from "./map-state";
import { LinePathInput } from "@/common/messages/line";

export interface SerializedLinePath {
  k: 'ss' | 'sc';    // kind
  i?: StationId;     // 'ss': stationId
  r?: number;        // 'ss': rank (absent → 0)
  n?: NodeId;        // 'sc': nodeId
  e?: [RoadSectionId, 0 | 1]; // 'sc': exiting sectionId
  a?: [RoadSectionId, 0 | 1]; // 'sc': entering sectionId
  f?: number;        // 'sc': exitRank (absent → 0)
  g?: number;        // 'sc': enterRank (absent → 0)
}

export type LinePath = StationStop | RoadSectionChange;

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace LinePath {
  export function fromLinePathInput(mapState: Readonly<MapState>, input: LinePathInput): LinePath {
    if (input.kind === 'station-stop') {
      const station = mapState.getStation(input.stationId);
      return new StationStop(mapState).applyProps({ station, rank: 0, stops: true });
    }
    else {
      const node = mapState.getNode(input.nodeId);
      const exiting = input.exiting
        ? { section: mapState.getRoadSection(input.exiting.sectionId), side: input.exiting.side }
        : null;
      const entering = input.entering
        ? { section: mapState.getRoadSection(input.entering.sectionId), side: input.entering.side }
        : null;
      return new RoadSectionChange(mapState).applyProps({ node, exiting, entering, exitRank: 0, enterRank: 0 });
    }
  }

  export function deserialize(mapState: Readonly<MapState>, ser: SerializedLinePath): LinePath {
    if (ser.k === 'ss') {
      if (!ser.i) throw new Error(`Serialized StationStop is missing stationId`);
      return new StationStop(mapState).applySerialized(ser);
    }
    else if (ser.k === 'sc') {
      if (!ser.n) throw new Error(`Serialized RoadSectionChange is missing nodeId`);
      return new RoadSectionChange(mapState).applySerialized(ser);
    }
    throw new Error(`Unknown line path kind: ${ser.k}`);
  }
}

export interface StationStopProps {
  station: Station;
  rank: number;
  stops: boolean; // false = passes through without stopping
}

export class StationStop {
  readonly kind = 'station-stop' as const;
  index: number = 0;
  mapState: Readonly<MapState>;
  station!: Station;
  rank!: number;
  stops!: boolean; // false = passes through without stopping

  constructor(mapState: Readonly<MapState>) {
    this.mapState = mapState;
  }

  applyProps(props: StationStopProps): this {
    this.station = props.station;
    this.rank = props.rank;
    this.stops = props.stops;
    return this;
  }

  applySerialized(ser: SerializedLinePath): this {
    if (ser.k !== 'ss') throw new Error(`Invalid serialized data for StationStop: ${JSON.stringify(ser)}`);
    if (!ser.i) throw new Error(`Serialized StationStop is missing stationId: ${JSON.stringify(ser)}`);
    this.station = this.mapState.getStation(ser.i);
    this.rank = ser.r ?? 0;
    this.stops = true; // default to true if not specified
    return this;
  }

  serialize(): SerializedLinePath {
    return {
      k: 'ss',
      i: this.station.id,
      r: this.rank || undefined,
    };
  }
}

export interface RoadSectionChangeProps {
  node: Node;
  exiting: { section: RoadSection, side: 0 | 1 } | null;
  entering: { section: RoadSection, side: 0 | 1 } | null;
  exitRank: number;
  enterRank: number;
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

  applyProps(props: RoadSectionChangeProps): this {
    this.node = props.node;
    this.exiting = props.exiting;
    this.entering = props.entering;
    this.exitRank = props.exitRank;
    this.enterRank = props.enterRank;
    return this;
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
