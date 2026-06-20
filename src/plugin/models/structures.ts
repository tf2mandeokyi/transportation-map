import { HVAlign, LineId, NodeId, RoadId, RoadSectionId, StationId } from "@/common/types";

export interface Connection {
  endpointPos: Vector;
  groupNumber: number;
}

export interface Node {
  id: NodeId;
  name?: string;
  isolatedPos?: Vector;
  roadConnections: Array<{ roadId: RoadId; endpointIndex: 0 | 1 }>;
}

export interface RoadSection {
  id: RoadSectionId;
  name?: string;
  index: number;
  stationIds: StationId[];
}

export interface Road {
  id: RoadId;
  name?: string;
  startNodeId: NodeId;
  endNodeId: NodeId;
  bezierMidPoint: Vector;
  endpoints: [Connection, Connection];
  sections: Map<RoadSectionId, RoadSection>;
}

export interface Station {
  id: StationId;
  name: string;
  figmaNodeId: string | null;
  textAlign: HVAlign;
  textHAlign: 'left' | 'center' | 'right';
  textRotation: number;
  flipped: boolean;
  interpT: number;
  roadSectionId: RoadSectionId | null;
}

export interface StationStop {
  kind: 'station-stop';
  index: number;
  stationId: StationId;
  rank: number;
  stops: boolean; // false = passes through without stopping
}

export interface RoadSectionEnter {
  kind: 'road-section-enter';
  index: number;
  sourceRoadId: RoadId;
  nodeId: NodeId;
  destRoadId: RoadId;
}

export type LinePath = StationStop | RoadSectionEnter;

export interface Line {
  id: LineId;
  name: string;
  color: string;
  isCircular: boolean;
  paths: LinePath[];
  figmaGroupId: string | null;
}

export interface MapState {
  nodes: Map<NodeId, Node>;
  roads: Map<RoadId, Road>;
  stations: Map<StationId, Station>;
  lines: Map<LineId, Line>;
  lineStackingOrder: LineId[];
}
