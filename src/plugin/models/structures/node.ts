import { LineId, NodeId } from "@/common/types";
import { TransportationMapObject } from './types';
import type { Road } from './road';
import { RoadSectionChange } from "./line-path";
import { Line } from "./line";

export interface SerializedNode {
  n?: string;                         // name
  x: number;                          // position.x
  y: number;                          // position.y
  r: number;                          // radius
}

export interface NodeProps {
  name?: string;
  position: Vector;
  radius: number;
}

// TODO: Make Node without any road connections invalid and remove them
export class Node extends TransportationMapObject<NodeId> {
  name?: string;
  position!: Vector;
  radius!: number;
  roadConnections: Array<{ road: Road; endpointIndex: 0 | 1 }> = [];

  applyProps(props: NodeProps): this {
    this.name = props.name;
    this.position = props.position;
    this.radius = props.radius;
    return this;
  }

  applySerialized(ser: SerializedNode): this {
    this.name = ser.n;
    this.position = { x: ser.x, y: ser.y };
    this.radius = ser.r;
    return this;
  }

  serialize(): SerializedNode {
    return {
      n: this.name,
      x: this.position.x,
      y: this.position.y,
      r: this.radius,
    };
  }

  getCenter(): Vector {
    return this.position;
  }

  moveByDelta(delta: Vector): void {
    this.position = { x: this.position.x + delta.x, y: this.position.y + delta.y };
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
