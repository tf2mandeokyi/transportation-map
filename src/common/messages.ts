import { LineId, StationId, StationOrientation } from "./types";

// Messages from UI to Plugin
export type UIToPluginMessage =
  | { type: 'add-station'; station: { name: string; orientation: StationOrientation; hidden: boolean } }
  | { type: 'update-station'; stationId: StationId; name: string; orientation: StationOrientation; hidden: boolean }
  | { type: 'delete-station'; stationId: StationId }
  | { type: 'add-line'; line: { name: string; color: string } }
  | { type: 'edit-line'; lineId: LineId }
  | { type: 'remove-line'; lineId: LineId }
  | { type: 'render-map'; rightHandTraffic: boolean }
  | { type: 'start-adding-stations-mode'; lineId: LineId }
  | { type: 'stop-adding-stations-mode' }
  | { type: 'get-line-path'; lineId: LineId }
  | { type: 'remove-station-from-line'; lineId: LineId; stationId: StationId }
  | { type: 'set-line-stops-at-station'; lineId: LineId; stationId: StationId; stopsAt: boolean }
  | { type: 'update-line-path'; lineId: LineId; stationIds: StationId[]; stopsAt: boolean[] }
  | { type: 'remove-line-from-station'; stationId: StationId; lineId: LineId }
  | { type: 'clear-plugin-data' }
  | { type: 'request-initial-data' };

export type LineData = { id: LineId; name: string; color: string };
export type LineAtStationData = LineData & { stopsAt: boolean };

// Messages from Plugin to UI
export type PluginToUIMessage =
  | { type: 'station-added' }
  | { type: 'line-added' } & LineData
  | { type: 'line-path-data'; lineId: LineId; stationIds: StationId[]; stationNames: string[]; stopsAt: boolean[] }
  | { type: 'toggle-stops-at'; lineId: LineId; stationId: StationId; stopsAt: boolean }
  | { type: 'station-removed-from-line' }
  | { type: 'station-clicked'; stationId: StationId; stationName: string; orientation: StationOrientation; hidden: boolean; lines: Array<LineAtStationData> };
