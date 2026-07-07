import { LineId, NodeId, RoadId, RoadSectionId, StationId } from "../types";
import { StationParams, LineAtStationData } from "./station";
import { LineData, LinePathData } from "./line";
import { LineAtNodeData, NodeData, RoadData, NetworkFocusedElement } from "./network";

// Where a road-creation endpoint handle currently resolves to, for the UI's live label.
export type RoadCreationSnap =
  | { kind: 'node'; nodeId: NodeId; name?: string }
  | { kind: 'road'; roadId: RoadId; name?: string }
  | null;

export type DisplayStation = {
  stationId: StationId;
  name: string;
  stops: boolean;    // whether the line stops here (vs pass-through)
};

export type DisplayEntry =
  | {
      kind: 'rse';
      isUturn: boolean;
      nodeId: NodeId;
      nodeName: string | null;
      exitRoadName: string | null;
      enterRoadName: string | null;
      exitSectionLabel: string | null;
      enterSectionLabel: string | null;
    }
  | {
      kind: 'traversal';
      direction: 'ascending' | 'descending';
      stations: DisplayStation[];
    }
  | {
      // Direction reversal within a section with no junction RSC.
      kind: 'virtual-uturn';
    };

export type PluginToUIMessage =
  | { type: 'session-created'; sessionId: string }
  | { type: 'station-clicked'; stationId: StationId; station: StationParams; lines: Array<LineAtStationData> }
  | ({ type: 'line-added' } & LineData)
  | { type: 'line-path-data'; lineId: LineId; paths: LinePathData[]; stationNames: Record<StationId, string>; stationRoadIds: Record<StationId, RoadId | null>; stationSectionIds: Record<StationId, RoadSectionId | null>; displayEntries: DisplayEntry[] }
  | { type: 'station-removed-from-line' }
  | { type: 'network-data'; nodes: NodeData[]; roads: RoadData[] }
  | { type: 'network-element-focused'; element: NetworkFocusedElement }
  | { type: 'network-selection-cleared' }
  | { type: 'road-creation-snap-update'; startSnap: RoadCreationSnap; endSnap: RoadCreationSnap }
  | { type: 'road-creation-exited' }
  | { type: 'road-clicked'; roadId: RoadId; sectionId: RoadSectionId | null }
  | { type: 'node-lines-data'; nodeId: NodeId; lines: LineAtNodeData[] }
  | { type: 'map-data'; data: string };
