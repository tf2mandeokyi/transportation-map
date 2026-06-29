import { RoadSection } from "./road-section";
import { Station } from "./station";
import { Node } from "./node";
import type { Road } from "./road";
import { NodeId, RoadSectionId, StationId } from "@/common/types";
import { MapState } from "./map-state";
import { LinePathData } from "@/common/messages/line";
import { own, Owned } from "@/common/utils/ownership";
import { OffsetT } from "@/plugin/utils/offset-t";
import { Line } from "./line";
import { PathEntry } from "@/plugin/utils/path-entry";

function findSharedNode(roadA: Road, roadB: Road): Node | null {
  if (roadA.endpoints[1].node === roadB.endpoints[0].node || roadA.endpoints[1].node === roadB.endpoints[1].node) return roadA.endpoints[1].node;
  if (roadA.endpoints[0].node === roadB.endpoints[0].node || roadA.endpoints[0].node === roadB.endpoints[1].node) return roadA.endpoints[0].node;
  return null;
}

export interface RoadSectionPos {
  section: RoadSection;
  offset: OffsetT;
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

export abstract class LinePath {
  index: number = 0;
  abstract applySerialized(ser: SerializedLinePath): this;
  abstract serialize(): SerializedLinePath;
  abstract start(): RoadSectionPos | undefined;
  abstract end(): RoadSectionPos | undefined;
  // Returns the station this entry represents, or null for junctions.
  abstract renderStop(): Station | null;
  abstract computeEntry(line: Line): PathEntry<this>;
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace LinePath {
  export function fromData(mapState: Readonly<MapState>, input: LinePathData): Owned<LinePath> {
    if (input.kind === 'station-stop') {
      const ss = new StationStop(mapState);
      ss.station = mapState.getStationHarsh(input.stationId);
      ss.rank = input.rank ?? 0;
      ss.stops = input.stops ?? true;
      ss.direction = input.direction;
      return own(ss);
    }
    else {
      const rsc = new RoadSectionChange(mapState);
      rsc.node = mapState.getNodeHarsh(input.nodeId);
      rsc.exiting = input.exiting
        ? { section: mapState.getRoadSectionHarsh(input.exiting.sectionId), side: input.exiting.side }
        : null;
      rsc.entering = input.entering
        ? { section: mapState.getRoadSectionHarsh(input.entering.sectionId), side: input.entering.side }
        : null;
      rsc.exitRank = 0;
      rsc.enterRank = 0;
      return own(rsc);
    }
  }

  export function toData(p: LinePath): LinePathData {
    if (p instanceof StationStop) {
      return {
        kind: 'station-stop',
        index: p.index,
        stationId: p.station.id,
        direction: p.direction,
        stops: p.stops,
        rank: p.rank
      };
    }
    else if (p instanceof RoadSectionChange) {
      return {
        kind: 'road-section-change',
        index: p.index,
        nodeId: p.node.id,
        exiting: p.exiting ? { sectionId: p.exiting.section.getRoadSectionId(), side: p.exiting.side } : null,
        entering: p.entering ? { sectionId: p.entering.section.getRoadSectionId(), side: p.entering.side } : null,
      };
    }
    throw new Error(`Unhandled line path type: ${p.constructor.name}`);
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

export class StationStop extends LinePath {
  mapState: Readonly<MapState>;
  station!: Station;
  rank!: number;
  stops!: boolean; // false = passes through without stopping
  direction!: 'ascending' | 'descending'; // direction of travel along the line (for sorting)

  constructor(mapState: Readonly<MapState>) {
    super();
    this.mapState = mapState;
  }

  applySerialized(ser: SerializedLinePath): this {
    if (ser.k !== 'ss') throw new Error(`Invalid serialized data for StationStop: ${JSON.stringify(ser)}`);
    if (!ser.i) throw new Error(`Serialized StationStop is missing stationId: ${JSON.stringify(ser)}`);
    this.station = this.mapState.getStationHarsh(ser.i);
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

  start() {
    return {
      section: this.station.parentRoadSection,
      offset: this.station.interpT.withBias(this.direction === 'ascending' ? 'negative' : 'positive'),
    };
  }

  end() {
    return {
      section: this.station.parentRoadSection,
      offset: this.station.interpT.withBias(this.direction === 'ascending' ? 'positive' : 'negative'),
    };
  }

  renderStop() { return this.stops ? this.station : null; }

  computeEntry(line: Line): PathEntry<this> {
    const section = (this.station.parentRoadSection as RoadSection | undefined) ?? null;
    const road = section?.parentRoad ?? null;
    return new PathEntry(line, this, this.rank, road, section);
  }

  autoInsertRSCTo(currStop: StationStop): Owned<RoadSectionChange> | null {
    const prevStation = this.station;
    const currStation = currStop.station;
    const prevRoad = prevStation.parentRoadSection.parentRoad;
    const currRoad = currStation.parentRoadSection.parentRoad;
    if (prevRoad === currRoad) return null;
    const node = findSharedNode(prevRoad, currRoad);
    if (!node) return null;
    const rsc = new RoadSectionChange(this.mapState);
    rsc.node = node;
    rsc.exiting = { section: prevStation.parentRoadSection, side: node === prevRoad.endpoints[0].node ? 0 : 1 };
    rsc.entering = { section: currStation.parentRoadSection, side: node === currRoad.endpoints[0].node ? 0 : 1 };
    rsc.exitRank = this.rank;
    rsc.enterRank = currStop.rank;
    return own(rsc);
  }
}

export class RoadSectionChange extends LinePath {
  mapState: Readonly<MapState>;
  node!: Node;
  exiting!: { section: RoadSection, side: 0 | 1 } | null;
  entering!: { section: RoadSection, side: 0 | 1 } | null;
  exitRank!: number;
  enterRank!: number;

  constructor(mapState: Readonly<MapState>) {
    super();
    this.mapState = mapState;
  }

  applySerialized(ser: SerializedLinePath): this {
    if (ser.k !== 'sc') throw new Error(`Invalid serialized data for RoadSectionChange: ${JSON.stringify(ser)}`);
    if (!ser.n) throw new Error(`Serialized RoadSectionChange is missing nodeId: ${JSON.stringify(ser)}`);
    this.node = this.mapState.getNodeHarsh(ser.n);
    this.exiting = ser.e ? { section: this.mapState.getRoadSectionHarsh(ser.e[0]), side: ser.e[1] } : null;
    this.entering = ser.a ? { section: this.mapState.getRoadSectionHarsh(ser.a[0]), side: ser.a[1] } : null;
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

  start() {
    if (!this.exiting) return undefined;
    return {
      section: this.exiting.section,
      offset: new OffsetT(this.exiting.side, this.exiting.side === 0 ? 'positive' : 'negative')
    }
  }

  end() {
    if (!this.entering) return undefined;
    return {
      section: this.entering.section,
      offset: new OffsetT(this.entering.side, this.entering.side === 0 ? 'positive' : 'negative')
    }
  }

  renderStop() { return null; }

  computeEntry(line: Line): PathEntry<this> {
    const entry = this?.exiting ?? this?.entering;
    const section = entry?.section ?? null;
    const road = section?.parentRoad ?? null;
    const rank = this?.exiting === null ? (this?.enterRank ?? 0) : (this?.exitRank ?? 0);
    return new PathEntry(line, this, rank, road, section);
  }
}
