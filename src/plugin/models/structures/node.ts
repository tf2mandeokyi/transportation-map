import { LineId, NodeId } from "@/common/types";
import { TransportationMapObject } from './types';
import type { Road } from './road';
import { RoadSectionChange } from "./line-path";

export interface SerializedNode {
  n?: string;                         // name
}

export interface NodeProps {
  name?: string;
}

export class Node extends TransportationMapObject<NodeId> {
  name?: string;
  roadConnections: Array<{ road: Road; endpointIndex: 0 | 1 }> = [];

  applyProps(props: NodeProps): this {
    this.name = props.name;
    return this;
  }

  applySerialized(ser: SerializedNode): this {
    this.name = ser.n;
    return this;
  }

  serialize(): SerializedNode {
    return {
      n: this.name,
    };
  }

  addRoadConnection(road: Road, endpointIndex: 0 | 1): void {
    this.roadConnections.push({ road, endpointIndex });
  }

  updateRscRanks(changes: Array<{ lineId: LineId; pathIndex: number; exitRank: number; enterRank: number }>): void {
    for (const { lineId, pathIndex, exitRank, enterRank } of changes) {
      const line = this.mapState.getLine(lineId);
      if (!line) continue;
      const path = line.paths[pathIndex];
      if (path instanceof RoadSectionChange && path.node === this) {
        path.exitRank = exitRank;
        path.enterRank = enterRank;
      }
    }
  }
}
