import { RoadSectionId, SectionId, StationId } from "@/common/types";
import type { Road } from './road';
import type { Station } from './station';
import { TransportationMapObject } from "./types";
import { Line } from "./line";
import { RoadSectionPass } from "./line-path";
import { SECTION_GAP, sectionBandWidth } from "@/plugin/utils/constants";

// A single directed pass of a line through a section.
export type LinePass = {
  line: Line;
  passIndex: number;         // pass index in line.paths (-1 if none)
  stationId: StationId | null; // the reference station this pass is anchored to (null if none)
  stops: boolean;
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
    // Every entry — real stop or pass-through shadow — is a distinct directed pass and
    // needs its own lane slot. A U-turn's pivot station duplicates itself this way (see
    // line-validator.ts), so counting only `stops: true` entries would under-reserve
    // width for the reversed direction's pass.
    return Math.max(...this.stations.map(s => s.getLinePasses().length));
  }

  getWidth(): number {
    return sectionBandWidth(this.getMaxStationStopCount());
  }

  getStationsSorted(direction: 'ascending' | 'descending'): Station[] {
    if (direction === 'ascending') {
      return [...this.stations].sort((a, b) => a.interpT.compare(b.interpT));
    } else {
      return [...this.stations].sort((a, b) => b.interpT.compare(a.interpT));
    }
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

  // Returns one LinePass per directed run (lane slot) across all lines on the section;
  // only .length is meaningful (used for road-width computations).
  getLines(): LinePass[] {
    const allPasses: LinePass[] = [];
    for (const line of this.mapState.getLines()) {
      const count = line.countPassesOnSection(this);
      for (let i = 0; i < count; i++) {
        allPasses.push({ line, passIndex: -1, stationId: null, stops: true });
      }
    }
    return allPasses;
  }

  // Stacking rank (0..n-1) among every line's pass touching this section on `side`
  // (0/1, matching the road's physical endpoints) — a pass touches a side via its
  // fromRank (if its fromNode is on that side) and/or its toRank (if its toNode is).
  // Renumbers ranks in place (mutating the passes) and returns the fresh ordering.
  getLineStackingRanks(side: 0 | 1): Array<{ line: Line; passIndex: number; rank: number }> {
    const entries: Array<{ pass: RoadSectionPass; end: 'from' | 'to'; line: Line; passIndex: number; rank: number }> = [];
    for (const line of this.mapState.getLines()) {
      for (const [passIndex, pass] of line.paths.entries()) {
        if (pass.section !== this) continue;
        const fromSide = pass.direction === 'ascending' ? 0 : 1;
        const toSide = fromSide === 0 ? 1 : 0;
        if (fromSide === side) entries.push({ pass, end: 'from', line, passIndex, rank: pass.fromRank });
        if (toSide === side) entries.push({ pass, end: 'to', line, passIndex, rank: pass.toRank });
      }
    }
    entries.sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      if (a.line.id !== b.line.id) return a.line.id < b.line.id ? -1 : 1;
      return a.passIndex - b.passIndex;
    });
    entries.forEach((entry, index) => {
      if (entry.end === 'from') entry.pass.fromRank = index;
      else entry.pass.toRank = index;
    });
    return entries.map(({ line, passIndex, rank }) => ({ line, passIndex, rank }));
  }
}
