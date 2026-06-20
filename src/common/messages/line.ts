import { LineId, NodeId, RoadId, StationId } from "../types";

export type LinePathInput =
  | { kind: 'station-stop'; stationId: StationId }
  | { kind: 'road-section-enter'; sourceRoadId: RoadId; nodeId: NodeId; destRoadId: RoadId };

export type LineData = { id: LineId; name: string; color: string };

export type LinePatch =
  | { op: 'update-name'; name: string }
  | { op: 'update-color'; color: string }
  | { op: 'update-path'; paths: LinePathInput[] }
  | { op: 'rotate-path'; steps: number }
  | { op: 'remove-station'; pathIndex: number }
  | { op: 'toggle-stops'; pathIndex: number; stops: boolean };

export type UIToPluginLineMessage =
  | { type: 'add-line'; line: { name: string; color: string; isCircular?: boolean } }
  | { type: 'remove-line'; lineId: LineId }
  | { type: 'patch-line'; lineId: LineId; patch: LinePatch }
  | { type: 'update-line-stacking-order'; lineIds: LineId[] }
  | { type: 'start-adding-stations-mode'; lineId: LineId }
  | { type: 'get-line-path'; lineId: LineId };
