import { LineId, StationId, StationOrientation } from "./types";

// Messages from UI to Plugin
export type UIToPluginMessage =
  | { type: 'add-stop'; stop: { name: string; orientation: StationOrientation; hidden: boolean } }
  | { type: 'add-line'; line: { name: string; color: string } }
  | { type: 'edit-line'; lineId: LineId }
  | { type: 'remove-line'; lineId: LineId }
  | { type: 'render-map'; rightHandTraffic: boolean }
  | { type: 'connect-stations-to-line'; lineId: LineId; stationIds: StationId[]; stopsAt: boolean }
  | { type: 'start-adding-stations-mode'; lineId: LineId }
  | { type: 'stop-adding-stations-mode' }
  | { type: 'get-line-path'; lineId: LineId }
  | { type: 'remove-station-from-line'; lineId: LineId; stationId: StationId }
  | { type: 'set-line-stops-at-station'; lineId: LineId; stationId: StationId; stopsAt: boolean }
  | { type: 'get-station-info'; stationId: StationId }
  | { type: 'remove-line-from-station'; stationId: StationId; lineId: LineId }
  | { type: 'clear-plugin-data' };

export type LineData = { id: LineId; name: string; color: string };
export type LineAtStationData = LineData & { stopsAt: boolean };

// Messages from Plugin to UI
export type PluginToUIMessage =
  | { type: 'line-added' } & LineData
  | { type: 'stop-added' }
  | { type: 'station-clicked'; stationId: StationId; stationName: string }
  | { type: 'stations-connected' }
  | { type: 'line-path-data'; lineId: LineId; stationIds: StationId[]; stationNames: string[]; stopsAt: boolean[] }
  | { type: 'toggle-stops-at'; lineId: LineId; stationId: StationId; stopsAt: boolean }
  | { type: 'station-removed-from-line' }
  | { type: 'station-info'; stationId: StationId; stationName: string; lines: Array<LineAtStationData> };
