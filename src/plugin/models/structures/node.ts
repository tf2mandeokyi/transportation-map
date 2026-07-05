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

  getRscEntries(): Array<{ line: Line; path: RoadSectionChange; groupIndex: number; position: Vector }> {
    const result: Array<{ line: Line; path: RoadSectionChange; groupIndex: number; position: Vector }> = [];
    for (const line of this.mapState.getLines()) {
      for (const [groupIndex, group] of line.paths.entries()) {
        const p = group.fromRoadSectionChange;
        if (!p || p.node !== this) continue;
        const position = p.computeEndPosition() ?? p.computeStartPosition();
        if (position) result.push({ line, path: p, groupIndex, position });
      }
    }
    return result;
  }

  updateRscRanks(changes: Array<{ lineId: LineId; groupIndex: number; exitRank: number; enterRank: number }>): void {
    for (const { lineId, groupIndex, exitRank, enterRank } of changes) {
      const line = this.mapState.getLineHarsh(lineId);
      if (!line) continue;
      const rsc = line.paths[groupIndex]?.fromRoadSectionChange;
      if (rsc && rsc.node === this) {
        rsc.exitRank = exitRank;
        rsc.enterRank = enterRank;
      }
    }
  }
}
