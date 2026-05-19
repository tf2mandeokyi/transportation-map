import { HVAlign, LineId, NodeId, RoadId, RoadSectionId, StationId } from "./types";
import { Connection, LinePath, RoadSection } from "@/plugin/models/structures";

export type LinePathInput = { kind: 'station-stop'; stationId: StationId } | { kind: 'road-section-enter'; roadSectionId: RoadSectionId };

// Messages from UI to Plugin
export type UIToPluginMessage =
  | { type: 'add-station'; station: { name: string; textAlign: HVAlign } }
  | { type: 'update-station'; stationId: StationId; name: string; textAlign: HVAlign }
  | { type: 'delete-station'; stationId: StationId }
  | { type: 'copy-station'; stationId: StationId; direction: 'forwards' | 'backwards' }
  | { type: 'combine-stations'; sourceStationId: StationId; targetStationId: StationId }
  | { type: 'select-station'; stationId: StationId }
  | { type: 'add-node'; node: { name?: string; pos: { x: number; y: number } } }
  | { type: 'remove-node'; nodeId: NodeId }
  | { type: 'add-road'; road: { name?: string; startNodeId: NodeId; endNodeId: NodeId; endpoints: [Connection, Connection] } }
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
  | { type: 'clear-plugin-data' }
  | { type: 'request-initial-data' }

export type LineData = { id: LineId; name: string; color: string };
export type LineAtStationData = LineData;

// Messages from Plugin to UI
export type PluginToUIMessage =
  | { type: 'station-added' }
  | { type: 'station-clicked'; stationId: StationId; stationName: string; textAlign: HVAlign; lines: Array<LineAtStationData> }
  | { type: 'line-added' } & LineData
  | { type: 'line-path-data'; lineId: LineId; paths: LinePath[]; stationNames: Record<StationId, string> }
  | { type: 'station-removed-from-line' }
