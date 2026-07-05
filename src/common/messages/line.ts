import { LineId, NodeId, RoadSectionId, StationId } from "../types"

export interface LinePathStationStopData {
  stationId: StationId;
  direction: 'ascending' | 'descending';
  rank?: number;
  stops?: boolean;
}

// Groups a run of the line's path — one optional junction crossing followed by
// the station stops that follow it — mirroring how SerializedLinePath groups
// a RoadSectionChange with its owned stationStops.
export interface LinePathData {
  fromNodeId?: NodeId;
  entering: { sectionId: RoadSectionId; side: 0 | 1, rank: number } | null;
  exiting: { sectionId: RoadSectionId; side: 0 | 1, rank: number } | null;
  stationStops: LinePathStationStopData[];
}

export type LineData = { id: LineId; name: string; color: string };

export type LinePatch =
  | { op: 'update-name'; name: string }
  | { op: 'update-color'; color: string }
  | { op: 'update-path'; paths: LinePathData[] }
  | { op: 'rotate-path'; steps: number }
  | { op: 'remove-station'; groupIndex: number; stopIndex: number }
  | { op: 'toggle-stops'; groupIndex: number; stopIndex: number; stops: boolean };

export type UIToPluginLineMessage =
  | { type: 'add-line'; line: { name: string; color: string; isCircular?: boolean } }
  | { type: 'remove-line'; lineId: LineId }
  | { type: 'patch-line'; lineId: LineId; patch: LinePatch }
  | { type: 'update-line-stacking-order'; lineIds: LineId[] }
  | { type: 'start-adding-stations-mode'; lineId: LineId }
  | { type: 'get-line-path'; lineId: LineId };
