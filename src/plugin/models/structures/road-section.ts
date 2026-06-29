import { RoadSectionId, SectionId, StationId } from "@/common/types";
import type { Road } from './road';
import type { Station } from './station';
import { TransportationMapObject } from "./types";
import { Line } from "./line";
import { RoadSectionChange, StationStop } from "./line-path";
import { SECTION_GAP, sectionBandWidth } from "@/plugin/utils/constants";

// A single directed pass of a line through a section.
export type LinePass = {
  line: Line;
  segmentIndex: number;    // path index of the station-stop entry at the reference station
};

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
  
  getMaxStationStopCount(): number {
    if (this.stations.length === 0) return 0;
    return Math.max(...this.stations.map(s => this.getLines(s).length));
  }

  getWidth(): number {
    return sectionBandWidth(this.getMaxStationStopCount());
  }

  computeOffset(): number {
    const sections = this.parentRoad.getSectionsByIndex();
    const widths = sections.map(s => s.getWidth());
    const gapTotal = Math.max(0, sections.length - 1) * SECTION_GAP;
    const totalWidth = widths.reduce((a, b) => a + b, 0) + gapTotal;
    let cumulative = -totalWidth / 2;
    for (let i = 0; i < sections.length; i++) {
      const center = cumulative + widths[i] / 2;
      if (sections[i] === this) return center;
      cumulative += widths[i] + SECTION_GAP;
    }
    return 0;
  }

  // Returns one LinePass per directed run (lane slot) on the section.
  // With referenceStationId: one entry per occurrence of that station in any line's path,
  //   sorted by rank so lane ordering is consistent with station stop ordering.
  // Without referenceStationId: one entry per directed run across all lines; only
  //   .length is meaningful (used for road-width computations).
  getLines(referenceStation?: Station): LinePass[] {
    if (referenceStation) {
      const passes: Array<LinePass & { rank: number }> = [];
      for (const line of this.mapState.getLines()) {
        for (const p of line.paths) {
          if (p instanceof StationStop && p.station === referenceStation) {
            passes.push({ line, segmentIndex: p.index, rank: p.rank });
          }
        }
      }
      passes.sort((a, b) => {
        if (a.rank !== b.rank) return a.rank - b.rank;
        return a.line.id < b.line.id ? -1 : 1;
      });
      return passes;
    }

    // No reference station: count directed runs per line for road-width sizing.
    const allPasses: LinePass[] = [];
    for (const line of this.mapState.getLines()) {
      const count = line.countPassesOnSection(this);
      for (let i = 0; i < count; i++) {
        allPasses.push({ line, segmentIndex: -1 });
      }
    }
    return allPasses;
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
