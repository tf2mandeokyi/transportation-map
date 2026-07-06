import { NodeId } from "@/common/types";
import { Node } from "./node";
import { MapState } from "./map-state";

export interface SerializedConnection {
  n: NodeId;   // nodeId
  o: number;   // horizontalOffset
  g: number;   // groupNumber
}

export interface Connection {
  node: Node;
  horizontalOffset: number;
  groupNumber: number;
}

export function serializeConnection(c: Connection): SerializedConnection {
  return { n: c.node.id, o: c.horizontalOffset, g: c.groupNumber };
}

export function deserializeConnection(mapState: Readonly<MapState>, c: SerializedConnection): Connection {
  return { node: mapState.getNodeHarsh(c.n), horizontalOffset: c.o, groupNumber: c.g };
}