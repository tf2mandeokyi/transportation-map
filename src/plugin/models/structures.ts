import { HVAlign, LineId, NodeId, RoadId, RoadSectionId, StationId } from "@/common/types";

export interface Connection {
  endpointDisplacement: Vector; // p0 = node.pos + endpointDisplacement (road start/end offset from junction)
  bezierDisplacement: Vector;   // p1 = p0 + bezierDisplacement (bezier control point)
  bezierDirection: Vector;
  groupNumber: number;
}

export interface Node {
  id: NodeId;
  name?: string;
  pos: Vector;
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
  endpoints: [Connection, Connection];
  sections: Map<RoadSectionId, RoadSection>;
}

export interface Station {
  id: StationId;
  name: string;
  figmaNodeId: string | null;
  textAlign: HVAlign;
  interpT: number;
  roadSectionId: RoadSectionId | null;
}

export interface StationStop {
  kind: 'station-stop';
  index: number;
  stationId: StationId;
}

export interface RoadSectionEnter {
  kind: 'road-section-enter';
  index: number;
  roadSectionId: RoadSectionId;
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
