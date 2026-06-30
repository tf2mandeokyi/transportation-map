import { NodeId, RoadSectionId, StationId } from "@/common/types";
import { RoadSection } from "../road-section";
import { LinePathData } from "@/common/messages";
import { OffsetT } from "@/plugin/utils/offset-t";
import { PathEntry } from "@/plugin/utils/path-entry";
import { Line } from "../line";
import { Station } from "../station";

export interface RoadSectionPos {
  section: RoadSection;
  offset: OffsetT;
}

// export interface SerializedLinePath {
//   k: 'ss' | 'sc';    // kind

//   i?: StationId;     // 'ss': stationId
//   r?: number;        // 'ss': rank (absent → 0)
//   d?: 'a' | 'd';     // 'ss': direction (ascending/descending)
//   t?: false;         // 'ss': stops=false (absent → true)

//   n?: NodeId;        // 'sc': nodeId
//   e?: [RoadSectionId, 0 | 1]; // 'sc': exiting sectionId
//   a?: [RoadSectionId, 0 | 1]; // 'sc': entering sectionId
//   f?: number;        // 'sc': exitRank (absent → 0)
//   g?: number;        // 'sc': enterRank (absent → 0)
// }

export type SerializedLinePath =
  {
    k: 'ss'; // kind
    i?: StationId; // stationId
    r?: number; // rank (absent → 0)
    d?: 'a' | 'd'; // direction (ascending/descending)
    t?: false; // stops=false (absent → true)
  } | {
    k: 'sc'; // kind
    n?: NodeId; // nodeId
    e?: [RoadSectionId, 0 | 1]; // exiting sectionId
    a?: [RoadSectionId, 0 | 1]; // entering sectionId
    f?: number; // exitRank (absent → 0)
    g?: number; // enterRank (absent → 0)
  };

export abstract class LinePath {
  index: number = 0;
  abstract applyData(data: LinePathData): this;
  abstract applySerialized(ser: SerializedLinePath): this;
  abstract toData(): LinePathData;
  abstract serialize(): SerializedLinePath;
  abstract start(): RoadSectionPos | undefined;
  abstract end(): RoadSectionPos | undefined;
  // Returns the station this entry represents, or null for junctions.
  abstract renderStop(): Station | null;
  abstract computeEntry(line: Line): PathEntry<this>;
}

