export type UIToPluginSystemMessage =
  | { type: 'render-map' }
  | { type: 'request-initial-data' }
  | { type: 'clear-plugin-data' }
  | { type: 'get-map-data' }
  | { type: 'undo' }
  | { type: 'redo' };
