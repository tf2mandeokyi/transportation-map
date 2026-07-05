import { NodeId, RoadSectionId, StationId } from "@/common/types";
import { RoadSection } from "../road-section";
import { OffsetT } from "@/plugin/utils/offset-t";
import { RoadSectionChange } from "./rsc";
import { StationStop } from "./station-stop";
import { LinePathData } from "@/common/messages";
import { MapState } from "../map-state";

export interface RoadSectionPos {
  section: RoadSection;
  offset: OffsetT;
}

export interface SerializedStationStop {
  s: StationId; // stationId
  d: 'a' | 'd'; // direction
  r: number;   // rank
  t?: false;   // stops (absent → true)
}

export interface SerializedLinePath {
  f?: NodeId; // fromNodeId
  e?: [RoadSectionId, 0 | 1, number]; // [enteringSectionId, side, rank]
  x?: [RoadSectionId, 0 | 1, number]; // [exitingSectionId, side, rank]
  s: SerializedStationStop[]; // stationStops
};

// Groups a run of the line's flat path entries — one optional junction crossing
// followed by the station stops that follow it — into a single wire-format record.
// This exists only at the (de)serialization boundary; Line's runtime path list stays flat.
export class LinePath {
  fromRoadSectionChange?: RoadSectionChange;
  stationStops: StationStop[] = [];

  static fromData(mapState: Readonly<MapState>, data: LinePathData): LinePath {
    const path = new LinePath();
    if (data.fromNodeId !== undefined) {
      path.fromRoadSectionChange = RoadSectionChange.fromData(mapState, data);
    }
    path.stationStops = data.stationStops.map(s => StationStop.fromData(mapState, s));
    return path;
  }

  static fromSerialized(mapState: Readonly<MapState>, ser: SerializedLinePath): LinePath {
    const path = new LinePath();
    if (ser.f !== undefined) {
      path.fromRoadSectionChange = RoadSectionChange.fromSerialized(mapState, ser.f, ser.e, ser.x);
    }
    path.stationStops = ser.s.map(s => StationStop.fromSerialized(mapState, s));
    return path;
  }

  toData(): LinePathData {
    return {
      ...(this.fromRoadSectionChange?.toData() ?? { fromNodeId: undefined, entering: null, exiting: null }),
      stationStops: this.stationStops.map(stop => stop.toData()),
    };
  }

  serialize(): SerializedLinePath {
    return {
      f: this.fromRoadSectionChange?.node.id,
      e: this.fromRoadSectionChange?.serializeEntering(),
      x: this.fromRoadSectionChange?.serializeExiting(),
      s: this.stationStops.map(stop => stop.serialize()),
    };
  }
}
