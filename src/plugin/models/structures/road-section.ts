import { RoadSectionId, SectionId, StationId } from "@/common/types";
import type { Road } from './road';
import type { Station } from './station';
import { TransportationMapObject } from "./types";
import { Line } from "./line";
import { RoadSectionChange } from "./line-path";

export interface SerializedRoadSection {
  n?: string;   // name
  x: number;    // index
  s: StationId[];  // stationIds
}

export interface RoadSectionProps {
  name?: string;
  index: number;
}
  
export class RoadSection extends TransportationMapObject<SectionId> {
  name?: string;
  index!: number;
  stations: Station[] = [];
  parentRoad!: Road;

  applyProps(parent: Road, props: RoadSectionProps): this {
    this.parentRoad = parent;
    this.name = props.name;
    this.index = props.index;
    return this;
  }

  applySerialized(parent: Road, ser: SerializedRoadSection): this {
    this.parentRoad = parent;
    this.name = ser.n;
    this.index = ser.x;
    this.stations = ser.s.map(stationId => {
      const station = this.mapState.getStationHarsh(stationId);
      station.setParent(this);
      return station;
    });
    return this;
  }

  getRoadSectionId(): RoadSectionId {
    return [this.parentRoad.id, this.id];
  }

  serialize(): SerializedRoadSection {
    return {
      n: this.name,
      x: this.index,
      s: this.stations.map(station => station.id),
    };
  }

  getLineStackingRanks(side: 0 | 1): Array<{ line: Line; pathIndex: number; rank: number }> {
    const rscs: Array<{ rsc: RoadSectionChange; line: Line; pathIndex: number; rank: number }> = [];
    for (const line of this.mapState.getLines()) {
      for (const [index, p] of line.paths.entries()) {
        if (!(p instanceof RoadSectionChange)) continue;
        if (p.entering?.section === this && p.entering.side === side) {
          rscs.push({ rsc: p, line, pathIndex: index, rank: p.enterRank });
        }
        if (p.exiting?.section === this && p.exiting.side === side) {
          rscs.push({ rsc: p, line, pathIndex: index, rank: p.exitRank });
        }
      }
    }
    rscs.sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      if (a.line.id !== b.line.id) return a.line.id < b.line.id ? -1 : 1;
      return a.pathIndex - b.pathIndex;
    });
    rscs.forEach((entry, index) => {
      if (entry.rsc.entering?.section === this && entry.rsc.entering.side === side) {
        entry.rsc.enterRank = index;
      }
      if (entry.rsc.exiting?.section === this && entry.rsc.exiting.side === side) {
        entry.rsc.exitRank = index;
      }
    });
    return rscs.map(({ line, pathIndex, rank }) => ({ line, pathIndex, rank }));
  }
}
