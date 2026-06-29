import { NodeId } from "@/common/types";
import { Node } from "./node";
import { MapState } from "./map-state";

export interface SerializedConnection {
  n: NodeId;                   // nodeId
  p: { x: number; y: number }; // endpointPos
  g: number;                   // groupNumber
}

export interface Connection {
  node: Node;
  endpointPos: Vector;
  groupNumber: number;
}

export function serializeConnection(c: Connection): SerializedConnection {
  return { n: c.node.id, p: c.endpointPos, g: c.groupNumber };
}

export function deserializeConnection(mapState: Readonly<MapState>, c: SerializedConnection): Connection {
  return { node: mapState.getNodeHarsh(c.n), endpointPos: c.p, groupNumber: c.g };
}