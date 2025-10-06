// Using branded types to prevent mixing up different kinds of IDs
export type NodeId = string & { readonly __brand: 'NodeId' };
export type LineId = string & { readonly __brand: 'LineId' };

export interface Vector {
  x: number;
  y: number;
}

// Defines the direction a node is "facing" for line stacking
export type NodeOrientation = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT' | 'DIAGONAL';

// Information about a specific line at a specific node
export interface LineStopInfo {
  stopsAt: boolean;
}

// Represents a single bus stop (a visible station or a hidden shaping point)
export interface Node {
  id: NodeId;
  figmaNodeId: string; // The ID of the corresponding FrameNode in Figma
  position: Vector;
  hidden: boolean;
  orientation: NodeOrientation;
  // A map of all lines passing through this node and their properties
  lines: Map<LineId, LineStopInfo>;
}

// Represents a single bus line
export interface Line {
  id: LineId;
  name: string;
  color: string; // Figma's native color format
  // An ordered list of NodeIds that defines the line's path
  path: NodeId[];
}

// The single source of truth for the entire map's state
export interface MapState {
  nodes: Map<NodeId, Node>;
  lines: Map<LineId, Line>;
  lineStackingOrder: LineId[];
}