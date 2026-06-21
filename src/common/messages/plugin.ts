import { LineId, NodeId, RoadId, RoadSectionId, StationId } from "../types";
import { LinePath } from "@/plugin/models/structures";
import { StationParams, LineAtStationData } from "./station";
import { LineData } from "./line";
import { NodeData, RoadData, NetworkFocusedElement } from "./network";

export type PluginToUIMessage =
  | { type: 'session-created'; sessionId: string }
  | { type: 'station-clicked'; stationId: StationId; station: StationParams; lines: Array<LineAtStationData> }
  | ({ type: 'line-added' } & LineData)
  | { type: 'line-path-data'; lineId: LineId; paths: LinePath[]; stationNames: Record<StationId, string>; stationRoadIds: Record<StationId, RoadId | null>; stationSectionIds: Record<StationId, RoadSectionId | null> }
  | { type: 'station-removed-from-line' }
  | { type: 'network-data'; nodes: NodeData[]; roads: RoadData[] }
  | { type: 'network-element-focused'; element: NetworkFocusedElement }
  | { type: 'network-selection-cleared' }
  | { type: 'road-creation-first-node'; nodeId: NodeId; name?: string }
  | { type: 'road-creation-exited' }
  | { type: 'road-clicked'; roadId: RoadId };
