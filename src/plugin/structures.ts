import { LineId, StationId, StationOrientation } from "../common/types";

// Information about a specific line at a specific node
export interface LineStopInfo {
  stopsAt: boolean;
}

// Represents a single stop (a visible station or a hidden shaping point)
export interface Station {
  id: StationId;
  name: string;
  figmaNodeId: string | null; // The ID of the corresponding FrameNode in Figma
  position: Vector;
  hidden: boolean;
  orientation: StationOrientation;
  // A map of all lines passing through this node and their properties
  lines: Map<LineId, LineStopInfo>;
}

// Represents a single line
export interface Line {
  id: LineId;
  name: string;
  color: RGB; // Figma's native color format
  // An ordered list of NodeIds that defines the line's path
  path: StationId[];
  // The Figma group ID that contains all visual elements for this line
  figmaGroupId: string | null;
}

// The single source of truth for the entire map's state
export interface MapState {
  stations: Map<StationId, Station>;
  lines: Map<LineId, Line>;
  lineStackingOrder: LineId[];
}