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
  // A crossing at a node is the boundary between two adjacent passes — the pass
  // ending here (toNode side) and the pass starting here (fromNode side). Either
  // side is null at the true start/end of a line's path.
  exitingPassIndex: number | null;
  enteringPassIndex: number | null;
  exitingSectionId: RoadSectionId | null;
  enteringSectionId: RoadSectionId | null;
  exitRank: number;
  enterRank: number;
};

export type NodePatch =
  | { op: 'update-name'; name: string | undefined }
  | { op: 'update-pass-ranks'; changes: Array<{ lineId: LineId; passIndex: number; end: 'from' | 'to'; rank: number }> };

export type RoadPatch =
  | { op: 'add-section'; section: { name?: string; index: number } }
  | { op: 'remove-section'; sectionId: RoadSectionId };

export type UIToPluginNetworkMessage =
  | { type: 'remove-node'; nodeId: NodeId }
  | { type: 'patch-node'; nodeId: NodeId; patch: NodePatch }
  | { type: 'start-adding-road-mode' }
  | { type: 'remove-road'; roadId: RoadId }
  | { type: 'patch-road'; roadId: RoadId; patch: RoadPatch }
  | { type: 'start-adding-rse-mode' };
