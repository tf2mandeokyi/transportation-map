export * from './placing-station';
export * from './adding-stations';
export * from './adding-rse';
export * from './adding-road';

import type { PlacingStationMessage } from './placing-station';
import type { AddingStationsMessage } from './adding-stations';
import type { AddingRseMessage } from './adding-rse';
import type { AddingRoadMessage } from './adding-road';

export type AnySessionMessage =
  | PlacingStationMessage
  | AddingStationsMessage
  | AddingRseMessage
  | AddingRoadMessage;
