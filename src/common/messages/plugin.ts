import { LineId, NodeId, RoadId, RoadSectionId, StationId } from "../types";
import { StationParams, LineAtStationData } from "./station";
import { LineData, LinePathData } from "./line";
import { LineAtNodeData, NodeData, RoadData, NetworkFocusedElement } from "./network";

export type DisplayStation = {
  stationId: StationId;
  name: string;
  inPath: boolean;   // true = actual stop in this traversal segment
  pathIndex: number; // flat path index; -1 if not in path
  stops: boolean;    // whether the line stops here (vs pass-through); only meaningful when inPath
};

export type DisplayEntry =
  | {
      kind: 'rse';
      pathIndex: number;
      isUturn: boolean;
      nodeId: NodeId;
      nodeName: string | null;
      exitRoadName: string | null;
      enterRoadName: string | null;
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
  | { type: 'road-creation-snap-update'; startSnap: { nodeId: NodeId; name?: string } | null; endSnap: { nodeId: NodeId; name?: string } | null }
  | { type: 'road-creation-exited' }
  | { type: 'road-clicked'; roadId: RoadId }
  | { type: 'node-lines-data'; nodeId: NodeId; lines: LineAtNodeData[] }
  | { type: 'map-data'; data: string };
