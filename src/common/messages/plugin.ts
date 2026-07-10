import { LineId, NodeId, RoadId, RoadSectionId, StationId } from "../types";
import { StationParams, LineAtStationData } from "./station";
import { LineData, RoadSectionPassData } from "./line";
import { LineAtNodeData, LineAtRoadSectionData, NodeData, RoadData, NetworkFocusedElement } from "./network";

// Where a road-creation endpoint handle currently resolves to, for the UI's live label.
export type RoadCreationSnap =
  | { kind: 'node'; nodeId: NodeId; name?: string }
  | { kind: 'road'; roadId: RoadId; name?: string }
  | null;

export type DisplayStation = {
  stationId: StationId;
  name: string;
  stops: boolean;    // whether the line stops here (vs pass-through)
  passIndex: number; // self-describing address — which pass this station belongs to
};

export type DisplayEntry =
  | {
      // The junction between two adjacent passes (or before-the-first/after-the-last
      // pass, uniformly — every pass boundary is a real node now, never dangling).
      kind: 'boundary';
      boundaryIndex: number;
      isUturn: boolean;
      nodeId: NodeId | null;
      nodeName: string | null;
      fromRoadName: string | null;
      toRoadName: string | null;
      fromSectionLabel: string | null;
      toSectionLabel: string | null;
    }
  | {
      kind: 'traversal';
      direction: 'ascending' | 'descending';
      stations: DisplayStation[];
    }
  | {
      // Adjacent passes don't connect (pass[i].toNode !== pass[i+1].fromNode) — missing road data.
      kind: 'invalid-jump';
      boundaryIndex: number;
      // The road only has two physical endpoints, so the node the prior pass ends at
      // pins down exactly which end the gap must start from.
      fromNodeId: NodeId | null;
      fromNodeName: string | null;
      // The node the next pass starts at, if there is one — the chain of added
      // passes must reach this node before it can be committed.
      toNodeId: NodeId | null;
      toNodeName: string | null;
    };

export type PluginToUIMessage =
  | { type: 'session-created'; sessionId: string }
  | { type: 'station-clicked'; stationId: StationId; station: StationParams; lines: Array<LineAtStationData> }
  | ({ type: 'line-added' } & LineData)
  | { type: 'line-path-data'; lineId: LineId; paths: RoadSectionPassData[]; stationNames: Record<StationId, string>; stationRoadIds: Record<StationId, RoadId | null>; stationSectionIds: Record<StationId, RoadSectionId | null>; displayEntries: DisplayEntry[] }
  | { type: 'station-removed-from-line' }
  | { type: 'network-data'; nodes: NodeData[]; roads: RoadData[] }
  | { type: 'network-element-focused'; element: NetworkFocusedElement }
  | { type: 'network-selection-cleared' }
  | { type: 'road-creation-snap-update'; startSnap: RoadCreationSnap; endSnap: RoadCreationSnap }
  | { type: 'road-creation-exited' }
  | { type: 'road-clicked'; roadId: RoadId; sectionId: RoadSectionId | null }
  | { type: 'node-lines-data'; nodeId: NodeId; lines: LineAtNodeData[] }
  | { type: 'road-lines-data'; roadId: RoadId; lines: LineAtRoadSectionData[] }
  | { type: 'map-data'; data: string };
