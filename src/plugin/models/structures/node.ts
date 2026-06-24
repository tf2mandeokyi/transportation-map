import { LineId, NodeId, RoadId } from "@/common/types";
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
}

export class Node implements Serializable<SerializedNode> {
  parent: IModel;
  id: NodeId;
  name?: string;
  isolatedPos?: Vector;
  roadConnections: Array<{ road: Road; endpointIndex: 0 | 1 }> = [];
  private _rawRoadConnections: Array<{ r: string; e: 0 | 1 }> = [];

  constructor(parent: IModel, id: NodeId, props: NodeProps) {
    this.parent = parent;
    this.id = id;
    this.name = props.name;
    this.isolatedPos = props.isolatedPos;
  }

  updateName(name: string | undefined): void { this.name = name; }

  updateRscRanks(changes: Array<{ lineId: LineId; pathIndex: number; exitRank: number; enterRank: number }>): void {
    const lines = this.parent.getState().lines;
    for (const { lineId, pathIndex, exitRank, enterRank } of changes) {
      const line = lines.get(lineId);
      if (!line) continue;
      const path = line.paths.find(p => p.index === pathIndex);
      if (path?.kind === 'road-section-change' && path.node === this) {
        path.exitRank = exitRank;
        path.enterRank = enterRank;
      }
    }
  }

  serialize(): SerializedNode {
    return {
      i: this.id,
      n: this.name,
      p: this.isolatedPos,
      r: this.roadConnections.map(rc => ({ r: rc.road.id, e: rc.endpointIndex })),
    };
  }

  resolve(roads: Map<RoadId, Road>): void {
    for (const rc of this._rawRoadConnections) {
      const road = roads.get(rc.r as RoadId);
      if (road) this.roadConnections.push({ road, endpointIndex: rc.e });
    }
  }

  static deserialize(ser: SerializedNode, parent: IModel): Node {
    const node = new Node(parent, ser.i as NodeId, { name: ser.n, isolatedPos: ser.p });
    node._rawRoadConnections = ser.r || [];
    return node;
  }
}
