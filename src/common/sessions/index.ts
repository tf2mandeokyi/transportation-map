export * from './placing-station';
export * from './adding-rse';
export * from './adding-road';

import type { PlacingStationMessage } from './placing-station';
import type { AddingRseMessage } from './adding-rse';
import type { AddingRoadMessage } from './adding-road';

export type AnySessionMessage =
  | PlacingStationMessage
  | AddingRseMessage
  | AddingRoadMessage;
