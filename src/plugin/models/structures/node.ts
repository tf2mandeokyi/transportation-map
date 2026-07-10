import { LineId, NodeId } from "@/common/types";
import { TransportationMapObject } from './types';
import type { Road } from './road';
import { RoadSectionPass } from "./line-path";
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

  // Every pass whose fromNode or toNode is this node — a "crossing" at this node is
  // just the boundary between two such entries (or a single dangling one at the true
  // start/end of a line's path, which is no longer a special case, just an entry with
  // nothing on the other side).
  getPassBoundaryEntries(): Array<{ line: Line; pass: RoadSectionPass; passIndex: number; end: 'from' | 'to'; position: Vector }> {
    const result: Array<{ line: Line; pass: RoadSectionPass; passIndex: number; end: 'from' | 'to'; position: Vector }> = [];
    for (const line of this.mapState.getLines()) {
      for (const [passIndex, pass] of line.paths.entries()) {
        if (pass.fromNode === this) {
          const position = pass.computeFromPosition();
          if (position) result.push({ line, pass, passIndex, end: 'from', position });
        }
        if (pass.toNode === this) {
          const position = pass.computeToPosition();
          if (position) result.push({ line, pass, passIndex, end: 'to', position });
        }
      }
    }
    return result;
  }

  updatePassRanks(changes: Array<{ lineId: LineId; passIndex: number; end: 'from' | 'to'; rank: number }>): void {
    for (const { lineId, passIndex, end, rank } of changes) {
      const line = this.mapState.getLineHarsh(lineId);
      if (!line) continue;
      const pass = line.paths[passIndex];
      if (!pass) continue;
      if (end === 'from' && pass.fromNode === this) pass.fromRank = rank;
      if (end === 'to' && pass.toNode === this) pass.toRank = rank;
    }
  }
}
