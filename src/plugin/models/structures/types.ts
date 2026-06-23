import { LineId, NodeId, RoadId, RoadSectionId, StationId } from "@/common/types";
import type { Node } from './node';
import type { Road } from './road';
import type { Station } from './station';
import type { Line } from './line';

export interface IModel {
  getState(): Readonly<MapState>;
}

export interface Serializable<T> {
  serialize(): T;
}

export interface Connection {
  endpointPos: Vector;
  groupNumber: number;
}

export interface StationStop {
  kind: 'station-stop';
  index: number;
  stationId: StationId;
  rank: number;
  stops: boolean; // false = passes through without stopping
}

export interface RoadSectionChange {
  kind: 'road-section-change';
  index: number;
  nodeId: NodeId;
  exiting: RoadSectionId | null;
  entering: RoadSectionId | null;
  exitRank: number;
  enterRank: number;
}

export type LinePath = StationStop | RoadSectionChange;

export interface MapState {
  nodes: Map<NodeId, Node>;
  roads: Map<RoadId, Road>;
  stations: Map<StationId, Station>;
  lines: Map<LineId, Line>;
  lineStackingOrder: LineId[];
}
