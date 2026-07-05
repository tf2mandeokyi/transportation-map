import { RoadSectionPos, SerializedStationStop } from "./base";
import { MapState } from "../map-state";
import { Station } from "../station";
import { RoadSectionChange } from "./rsc";
import { LinePathStationStopData } from "@/common/messages";
import { applyLateralOffset } from "@/plugin/utils/math";
import { lineOffsetInSection } from "@/plugin/utils/constants";

export class StationStop {
  station!: Station;
  rank!: number;
  stops!: boolean;
  direction!: 'ascending' | 'descending'; // direction of travel along the line (for sorting)

  static fromData(mapState: Readonly<MapState>, data: LinePathStationStopData): StationStop {
    const stop = new StationStop();
    stop.station = mapState.getStationHarsh(data.stationId);
    stop.rank = data.rank ?? 0;
    stop.direction = data.direction;
    stop.stops = data.stops ?? true;
    return stop;
  }

  static fromSerialized(mapState: Readonly<MapState>, ser: SerializedStationStop): StationStop {
    const stop = new StationStop();
    stop.station = mapState.getStationHarsh(ser.s);
    stop.rank = ser.r ?? 0;
    stop.direction = ser.d === 'd' ? 'descending' : 'ascending';
    stop.stops = ser.t !== false;
    return stop;
  }

  serialize(): SerializedStationStop {
    return {
      s: this.station.id,
      d: this.direction === 'descending' ? 'd' : 'a',
      r: this.rank,
      t: this.stops ? undefined : false,
    };
  }

  toData(): LinePathStationStopData {
    return {
      stationId: this.station.id,
      direction: this.direction,
      rank: this.rank,
      stops: this.stops,
    };
  }

  start(): RoadSectionPos {
    return {
      section: this.station.parentRoadSection,
      offset: this.station.interpT.withBias(this.direction === 'ascending' ? 'negative' : 'positive'),
    };
  }

  end(): RoadSectionPos {
    return {
      section: this.station.parentRoadSection,
      offset: this.station.interpT.withBias(this.direction === 'ascending' ? 'positive' : 'negative'),
    };
  }

  computePosition(): Vector | undefined {
    const section = this.station.parentRoadSection;
    const road = section.parentRoad;
    if (!road || !section) return undefined;

    const bezier = road.computeBezier();
    if (!bezier) return undefined;

    const numLines = section.getMaxStationStopCount();

    // A single directed pass can stop at the same station more than once (loop lines).
    // Mirror computeTotalOffset: effectiveCount = max(numLines, rank + 1) so that a rank
    // which exceeds the directed-pass count still maps to a valid slot.
    const effectiveCount = Math.max(numLines, this.rank + 1);
    const totalOffset = section.computeOffset() + lineOffsetInSection(this.rank, effectiveCount);
    const pos = this.station.interpT.evalBezier(bezier);
    if (totalOffset === 0) return pos;
    return applyLateralOffset(pos, this.station.interpT.evalBezierTangent(bezier), totalOffset);
  }

  autoInsertRSCTo(currStop: StationStop): RoadSectionChange | null {
    const prevStation = this.station;
    const currStation = currStop.station;
    const prevRoad = prevStation.parentRoadSection.parentRoad;
    const currRoad = currStation.parentRoadSection.parentRoad;
    if (prevRoad === currRoad) return null;
    const node = prevRoad.findSharedNode(currRoad);
    if (!node) return null;
    const rsc = new RoadSectionChange();
    rsc.node = node;
    rsc.exiting = { section: prevStation.parentRoadSection, side: node === prevRoad.endpoints[0].node ? 0 : 1 };
    rsc.entering = { section: currStation.parentRoadSection, side: node === currRoad.endpoints[0].node ? 0 : 1 };
    rsc.exitRank = this.rank;
    rsc.enterRank = currStop.rank;
    return rsc;
  }
}
