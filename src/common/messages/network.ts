import { LineId, NodeId, RoadId, RoadSectionId } from "../types";

export type NodeData = { id: NodeId; name?: string; pos: { x: number; y: number } };
export type RoadSectionData = { id: RoadSectionId; name?: string; index: number };
export type RoadData = { id: RoadId; name?: string; startNodeId: NodeId; endNodeId: NodeId; sections: RoadSectionData[] };

export type NetworkFocusedElement =
  | { kind: 'node'; nodeId: NodeId; name?: string; pos: { x: number; y: number } }
  | { kind: 'road'; roadId: RoadId; name?: string; startNodeId: NodeId; endNodeId: NodeId; sections: RoadSectionData[] };

export type LineAtNodeData = {
  lineId: LineId;
  lineName: string;
  lineColor: string;
  pathIndex: number;
  exitingSectionId: RoadSectionId | null;
  enteringSectionId: RoadSectionId | null;
  exitRank: number;
  enterRank: number;
};

export type NodePatch =
  | { op: 'update-name'; name: string | undefined }
  | { op: 'update-rsc-ranks'; changes: Array<{ lineId: LineId; pathIndex: number; exitRank: number; enterRank: number }> };

export type RoadPatch =
  | { op: 'add-section'; section: { name?: string; index: number } }
  | { op: 'remove-section'; sectionId: RoadSectionId };

export type UIToPluginNetworkMessage =
  | { type: 'add-node'; node: { name?: string; pos?: { x: number; y: number } } }
  | { type: 'remove-node'; nodeId: NodeId }
  | { type: 'patch-node'; nodeId: NodeId; patch: NodePatch }
  | { type: 'start-adding-road-mode' }
  | { type: 'remove-road'; roadId: RoadId }
  | { type: 'patch-road'; roadId: RoadId; patch: RoadPatch }
  | { type: 'start-adding-rse-mode' };
