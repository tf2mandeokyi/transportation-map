import { LineId, NodeId } from "@/common/types";
import { TransportationMapObject } from './types';
import type { Road } from './road';
import { RoadSectionChange } from "./line-path";
import { Line } from "./line";

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
  
  getCenter(): { x: number; y: number } {
    let sumX = 0, sumY = 0, count = 0;
    for (const { road, endpointIndex } of this.roadConnections) {
      sumX += road.endpoints[endpointIndex].endpointPos.x;
      sumY += road.endpoints[endpointIndex].endpointPos.y;
      count++;
    }
    if (count == 0) throw new Error(`Node ${this.id} has no road connections, cannot compute center`);
    return { x: sumX / count, y: sumY / count };
  }

  moveByDelta(delta: { x: number; y: number }): void {
    for (const { road, endpointIndex } of this.roadConnections) {
      const oldPos = road.endpoints[endpointIndex].endpointPos
      road.endpoints[endpointIndex].endpointPos = { x: oldPos.x + delta.x, y: oldPos.y + delta.y };
    }
  }

  addRoadConnection(road: Road, endpointIndex: 0 | 1): void {
    this.roadConnections.push({ road, endpointIndex });
  }

  updateName(name: string | undefined): void {
    this.name = name;
  }

  getRscEntries(): Array<{ line: Line; path: RoadSectionChange; position: Vector }> {
    return this.mapState.getLinePaths((p): p is RoadSectionChange => p instanceof RoadSectionChange && p.node === this);
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
