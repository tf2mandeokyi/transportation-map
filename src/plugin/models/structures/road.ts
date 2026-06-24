import { NodeId, RoadId, RoadSectionId } from "@/common/types";
import { QuadBezierPoints } from '../../utils/bezier';
import { Connection, IModel, Serializable } from './types';
import { RoadSection, SerializedRoadSection } from './road-section';
import type { Node } from './node';

interface SerializedConnection {
  p: { x: number; y: number }; // endpointPos
  g: number;                   // groupNumber
}

export interface SerializedRoad {
  i: string;                                          // id
  n?: string;                                         // name
  s: string;                                          // startNodeId
  e: string;                                          // endNodeId
  b: { x: number; y: number };                       // bezierMidPoint
  p: [SerializedConnection, SerializedConnection];    // endpoints
  c: SerializedRoadSection[];                         // sections
}

export interface RoadCoreProps {
  name?: string;
  bezierMidPoint: Vector;
  endpoints: [Connection, Connection];
}

export interface RoadProps extends RoadCoreProps {
  startNodeId: NodeId;
  endNodeId: NodeId;
}

export class Road implements Serializable<SerializedRoad> {
  parent: IModel;
  id: RoadId;
  name?: string;
  startNode!: Node;
  endNode!: Node;
  bezierMidPoint: Vector;
  endpoints: [Connection, Connection];
  sections: Map<RoadSectionId, RoadSection> = new Map();
  private _startNodeId!: NodeId;
  private _endNodeId!: NodeId;

  constructor(parent: IModel, id: RoadId, props: RoadCoreProps) {
    this.parent = parent;
    this.id = id;
    this.name = props.name;
    this.bezierMidPoint = props.bezierMidPoint;
    this.endpoints = props.endpoints;
  }

  computeBezier(): QuadBezierPoints | null {
    if (!this.startNode || !this.endNode) return null;
    return {
      p0: this.endpoints[0].endpointPos,
      p1: this.bezierMidPoint,
      p2: this.endpoints[1].endpointPos,
    };
  }

  serialize(): SerializedRoad {
    return {
      i: this.id,
      n: this.name,
      s: this.startNode.id,
      e: this.endNode.id,
      b: this.bezierMidPoint,
      p: [serializeConnection(this.endpoints[0]), serializeConnection(this.endpoints[1])],
      c: Array.from(this.sections.values()).map(sec => sec.serialize()),
    };
  }

  resolve(nodes: Map<NodeId, Node>): void {
    const startNode = nodes.get(this._startNodeId);
    const endNode = nodes.get(this._endNodeId);
    if (startNode) this.startNode = startNode;
    if (endNode) this.endNode = endNode;
    for (const section of this.sections.values()) section.resolve(this);
  }

  static deserialize(ser: SerializedRoad, parent: IModel): Road {
    const road = new Road(parent, ser.i as RoadId, {
      name: ser.n,
      bezierMidPoint: ser.b,
      endpoints: [deserializeConnection(ser.p[0]), deserializeConnection(ser.p[1])],
    });
    road._startNodeId = ser.s as NodeId;
    road._endNodeId = ser.e as NodeId;
    return road;
  }
}

function serializeConnection(c: Connection): SerializedConnection {
  return { p: c.endpointPos, g: c.groupNumber };
}

function deserializeConnection(c: SerializedConnection): Connection {
  return { endpointPos: c.p, groupNumber: c.g };
}
