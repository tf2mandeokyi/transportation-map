import { HVAlign, LineId, NodeId, RoadId, RoadSectionId, StationId } from "./types";
import { LinePath, RoadSection } from "@/plugin/models/structures";

export type LinePathInput = { kind: 'station-stop'; stationId: StationId } | { kind: 'road-section-enter'; sourceRoadId: RoadId; nodeId: NodeId; destRoadId: RoadId };

export type NodeData = { id: NodeId; name?: string; pos: { x: number; y: number } };
export type RoadSectionData = { id: RoadSectionId; name?: string; index: number };
export type RoadData = { id: RoadId; name?: string; startNodeId: NodeId; endNodeId: NodeId; sections: RoadSectionData[] };

// Messages from UI to Plugin
export type UIToPluginMessage =
  | { type: 'add-station'; station: { name: string; textAlign: HVAlign; textRotation?: number; roadSectionId?: RoadSectionId; interpT?: number } }
  | { type: 'update-station'; stationId: StationId; name: string; textAlign: HVAlign; textRotation: number }
  | { type: 'delete-station'; stationId: StationId }
  | { type: 'copy-station'; stationId: StationId; direction: 'forwards' | 'backwards' }
  | { type: 'combine-stations'; sourceStationId: StationId; targetStationId: StationId }
  | { type: 'select-station'; stationId: StationId }
  | { type: 'add-node'; node: { name?: string; pos: { x: number; y: number } } }
  | { type: 'remove-node'; nodeId: NodeId }
  | { type: 'start-adding-road-mode' }
  | { type: 'cancel-adding-road-mode' }
  | { type: 'remove-road'; roadId: RoadId }
  | { type: 'add-road-section'; roadId: RoadId; section: Omit<RoadSection, 'id' | 'stationIds'> }
  | { type: 'remove-road-section'; roadId: RoadId; sectionId: RoadSectionId }
  | { type: 'add-line'; line: { name: string; color: string; isCircular?: boolean } }
  | { type: 'remove-line'; lineId: LineId }
  | { type: 'update-line-name'; lineId: LineId; name: string }
  | { type: 'update-line-color'; lineId: LineId; color: string }
  | { type: 'render-map' }
  | { type: 'start-adding-stations-mode'; lineId: LineId }
  | { type: 'stop-adding-stations-mode' }
  | { type: 'get-line-path'; lineId: LineId }
  | { type: 'remove-station-from-line'; lineId: LineId; pathIndex: number }
  | { type: 'update-line-path'; lineId: LineId; paths: LinePathInput[] }
  | { type: 'rotate-line-path'; lineId: LineId; steps: number }
  | { type: 'update-line-stacking-order'; lineIds: LineId[] }
  | { type: 'update-station-stop-ranks'; stationId: StationId; stops: Array<{ lineId: LineId; pathIndex: number; rank: number }> }
  | { type: 'clear-plugin-data' }
  | { type: 'request-initial-data' }
  | { type: 'validate-line-paths' }

export type LineData = { id: LineId; name: string; color: string };
export type LineAtStationData = LineData & { pathIndex: number; rank: number };

export type NetworkFocusedElement =
  | { kind: 'node'; nodeId: NodeId; name?: string; pos: { x: number; y: number } }
  | { kind: 'road'; roadId: RoadId; name?: string; startNodeId: NodeId; endNodeId: NodeId; sections: RoadSectionData[] };

// Messages from Plugin to UI
export type PluginToUIMessage =
  | { type: 'station-clicked'; stationId: StationId; stationName: string; textAlign: HVAlign; textRotation: number; lines: Array<LineAtStationData> }
  | { type: 'line-added' } & LineData
  | { type: 'line-path-data'; lineId: LineId; paths: LinePath[]; stationNames: Record<StationId, string> }
  | { type: 'station-removed-from-line' }
  | { type: 'network-data'; nodes: NodeData[]; roads: RoadData[] }
  | { type: 'network-element-focused'; element: NetworkFocusedElement }
  | { type: 'network-selection-cleared' }
  | { type: 'road-creation-first-node'; nodeId: NodeId; name?: string }
  | { type: 'road-creation-exited' }
