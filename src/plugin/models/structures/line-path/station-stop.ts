import { Owned, own } from "@/common/utils/ownership";
import { PathEntry } from "@/plugin/utils/path-entry";
import { SerializedLinePath } from "./base";
import { Line } from "../line";
import { MapState } from "../map-state";
import { Node } from "../node";
import { Road } from "../road";
import { RoadSection } from "../road-section";
import { Station } from "../station";
import { LinePath } from "./base";
import { RoadSectionChange } from "./rsc";
import { LinePathData } from "@/common/messages";

function findSharedNode(roadA: Road, roadB: Road): Node | null {
  if (roadA.endpoints[1].node === roadB.endpoints[0].node || roadA.endpoints[1].node === roadB.endpoints[1].node) return roadA.endpoints[1].node;
  if (roadA.endpoints[0].node === roadB.endpoints[0].node || roadA.endpoints[0].node === roadB.endpoints[1].node) return roadA.endpoints[0].node;
  return null;
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

  applySerialized(ser: Extract<SerializedLinePath, { k: 'ss' }>): this {
    if (!ser.i) throw new Error(`Serialized StationStop is missing stationId: ${JSON.stringify(ser)}`);
    this.station = this.mapState.getStationHarsh(ser.i);
    this.rank = ser.r ?? 0;
    this.stops = ser.t !== false;
    this.direction = ser.d === 'd' ? 'descending' : 'ascending';
    return this;
  }

  serialize(): SerializedLinePath {
    return {
      k: 'ss',
      i: this.station.id,
      r: this.rank || undefined,
      d: this.direction === 'descending' ? 'd' : 'a',
      t: this.stops ? undefined : false,
    };
  }

  applyData(data: Extract<LinePathData, { kind: 'station-stop' }>): this {
    this.station = this.mapState.getStationHarsh(data.stationId);
    this.rank = data.rank ?? 0;
    this.stops = data.stops ?? true;
    this.direction = data.direction;
    return this;
  }

  toData(): LinePathData {
    return {
      kind: 'station-stop',
      index: this.index,
      stationId: this.station.id,
      direction: this.direction,
      stops: this.stops,
      rank: this.rank
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

  renderStop() { return this.station; }

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