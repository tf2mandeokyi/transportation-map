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

// TODO: Make Node without any road connections invalid and remove them
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
  
  computeCenter(defaultPosition: { x: number; y: number }): { x: number; y: number } {
    let sumX = 0, sumY = 0, count = 0;
    for (const { road, endpointIndex } of this.roadConnections) {
      sumX += road.endpoints[endpointIndex].endpointPos.x;
      sumY += road.endpoints[endpointIndex].endpointPos.y;
      count++;
    }
    if (count > 0) return { x: sumX / count, y: sumY / count };
    return defaultPosition;
  }

  addRoadConnection(road: Road, endpointIndex: 0 | 1): void {
    this.roadConnections.push({ road, endpointIndex });
  }

  updateName(name: string | undefined): void {
    this.name = name;
  }

  updateRscRanks(changes: Array<{ lineId: LineId; pathIndex: number; exitRank: number; enterRank: number }>): void {
    for (const { lineId, pathIndex, exitRank, enterRank } of changes) {
      const line = this.mapState.getLineHarsh(lineId);
      if (!line) continue;
      const path = line.paths[pathIndex];
      if (path instanceof RoadSectionChange && path.node === this) {
        path.exitRank = exitRank;
        path.enterRank = enterRank;
      }
    }
  }
}
