import { HVAlign, LineId, RoadSectionId, StationId, TextHAlign } from "../types";

export type StationParams = { name: string; textAlign: HVAlign; textHAlign: TextHAlign; textRotation: number; flipped: boolean };

export type LineAtStationData = {
  id: LineId;
  name: string;
  color: string;
  passIndex: number;
  rank: number;
  facing: 'left' | 'right';
  stops: boolean;
};

export type StationPatch =
  | { op: 'update'; station: StationParams }
  | { op: 'delete' }
  | { op: 'copy'; direction: 'forwards' | 'backwards' }
  | { op: 'combine'; targetStationId: StationId }
  | { op: 'update-stop-ranks'; stops: Array<{ lineId: LineId; passIndex: number; rank: number }> };

export type UIToPluginStationMessage =
  | { type: 'start-placing-station-mode' }
  | { type: 'add-station'; station: StationParams & { roadSectionId: RoadSectionId | null; interpT: number } }
  | { type: 'patch-station'; stationId: StationId; patch: StationPatch }
  | { type: 'select-station'; stationId: StationId }
  | { type: 'get-station-info'; stationId: StationId };
