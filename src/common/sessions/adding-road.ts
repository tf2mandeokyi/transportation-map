export type AddingRoadMessage =
  | { type: 'confirm-adding-road' }
  | { type: 'cancel-adding-road-mode' }
  | { type: 'set-road-snap-mode'; enabled: boolean };
