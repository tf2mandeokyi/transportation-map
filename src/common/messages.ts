// Defines the direction a node is "facing" for line stacking
export type StationOrientation = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

// Messages from UI to Plugin
export type UIToPluginMessage =
  | { type: 'add-stop'; stop: { name: string; orientation: StationOrientation; hidden: boolean } }
  | { type: 'add-line'; line: { name: string; color: string } }
  | { type: 'edit-line'; lineId: string }
  | { type: 'remove-line'; lineId: string }
  | { type: 'render-map'; rightHandTraffic: boolean }
  | { type: 'connect-stations-to-line'; lineId: string; stationIds: string[]; stopsAt: boolean }
  | { type: 'start-adding-stations-mode'; lineId: string }
  | { type: 'stop-adding-stations-mode' }
  | { type: 'get-line-path'; lineId: string }
  | { type: 'remove-station-from-line'; lineId: string; stationId: string }
  | { type: 'set-line-stops-at-station'; lineId: string; stationId: string; stopsAt: boolean };

// Messages from Plugin to UI
export type PluginToUIMessage =
  | { type: 'line-added'; lineId: string; name: string; color: string }
  | { type: 'stop-added' }
  | { type: 'station-clicked'; stationId: string; stationName: string }
  | { type: 'stations-connected' }
  | { type: 'line-path-data'; lineId: string; stationIds: string[]; stationNames: string[]; stopsAt: boolean[] }
  | { type: 'toggle-stops-at'; lineId: string; stationId: string; stopsAt: boolean }
  | { type: 'station-removed-from-line' };
