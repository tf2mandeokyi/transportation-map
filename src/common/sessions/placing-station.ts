import { StationParams } from "../messages/station";

export type PlacingStationMessage =
  | { type: 'confirm-place-station'; station: StationParams }
  | { type: 'cancel-placing-station-mode' };
