import { LineId, RoadSectionId, StationId } from "../types"

export interface RoadSectionPassStopData {
  stationId: StationId;
  rank: number;
  stops: boolean;
}

// One full traversal of a single RoadSection between its two physical endpoints.
// Carries the full merged (real + pass-through) stop list — the UI needs pass-through
// candidates to render/toggle, unlike the persisted/disk form which only keeps real stops.
export interface RoadSectionPassData {
  sectionId: RoadSectionId;
  direction: 'ascending' | 'descending';
  fromRank: number;
  toRank: number;
  stops: RoadSectionPassStopData[];
}

export type LineData = { id: LineId; name: string; color: string };

export type LinePatch =
  // Commits name and color together so a single Line Info Editor Apply click is a
  // single undo/redo step instead of one per changed field.
  | { op: 'update-info'; name: string; color: string }
  | { op: 'update-path'; paths: RoadSectionPassData[] }
  | { op: 'insert-passes'; boundaryIndex: number; passes: RoadSectionPassData[] }
  | { op: 'remove-pass'; passIndex: number }
  | { op: 'rotate-path'; steps: number }
  | { op: 'toggle-stops'; passIndex: number; stationId: StationId; stops: boolean };

export type UIToPluginLineMessage =
  | { type: 'add-line'; line: { name: string; color: string; isCircular?: boolean } }
  | { type: 'remove-line'; lineId: LineId }
  | { type: 'patch-line'; lineId: LineId; patch: LinePatch }
  | { type: 'update-line-stacking-order'; lineIds: LineId[] }
  | { type: 'get-line-path'; lineId: LineId };
