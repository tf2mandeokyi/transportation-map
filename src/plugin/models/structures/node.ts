import { NodeId, RoadId } from "@/common/types";
import { IModel, Serializable } from './types';
import type { Road } from './road';

export interface SerializedNode {
  i: string;                          // id
  n?: string;                         // name
  p?: { x: number; y: number };       // isolatedPos
  r: Array<{ r: string; e: 0 | 1 }>; // roadConnections
}

export interface NodeProps {
  name?: string;
  isolatedPos?: Vector;
  roadConnections: Array<{ roadId: RoadId; endpointIndex: 0 | 1 }>;
}

export class Node implements NodeProps, Serializable<SerializedNode> {
  parent: IModel;
  id: NodeId;
  name?: string;
  isolatedPos?: Vector;
  roadConnections: Array<{ roadId: RoadId; endpointIndex: 0 | 1 }>;

  constructor(parent: IModel, id: NodeId, props: NodeProps) {
    this.parent = parent;
    this.id = id;
    this.name = props.name;
    this.isolatedPos = props.isolatedPos;
    this.roadConnections = props.roadConnections;
  }

  getRoads(): Road[] {
    const { roads } = this.parent.getState();
    return this.roadConnections
      .map(rc => roads.get(rc.roadId))
      .filter((r): r is Road => r != null);
  }

  serialize(): SerializedNode {
    return {
      i: this.id,
      n: this.name,
      p: this.isolatedPos,
      r: this.roadConnections.map(rc => ({ r: rc.roadId, e: rc.endpointIndex })),
    };
  }

  static deserialize(ser: SerializedNode, parent: IModel): Node {
    return new Node(parent, ser.i as NodeId, {
      name: ser.n,
      isolatedPos: ser.p,
      roadConnections: ser.r.map(rc => ({ roadId: rc.r as RoadId, endpointIndex: rc.e })),
    });
  }
}
