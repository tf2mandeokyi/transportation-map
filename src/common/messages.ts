export * from './messages/station';
export * from './messages/line';
export * from './messages/network';
export * from './messages/system';
export * from './messages/plugin';

import type { UIToPluginStationMessage } from './messages/station';
import type { UIToPluginLineMessage } from './messages/line';
import type { UIToPluginNetworkMessage } from './messages/network';
import type { UIToPluginSystemMessage } from './messages/system';

export type UIToPluginMessage =
  | UIToPluginStationMessage
  | UIToPluginLineMessage
  | UIToPluginNetworkMessage
  | UIToPluginSystemMessage;
