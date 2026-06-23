import { NodeId, RoadId, RoadSectionId } from "@/common/types";
import { QuadBezierPoints } from '../../utils/bezier';
import { Connection, IModel, Serializable } from './types';
import { RoadSection, SerializedRoadSection } from './road-section';

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

export interface RoadProps {
  name?: string;
  startNodeId: NodeId;
  endNodeId: NodeId;
  bezierMidPoint: Vector;
  endpoints: [Connection, Connection];
  sections: Map<RoadSectionId, RoadSection>;
}

export class Road implements RoadProps, Serializable<SerializedRoad> {
  parent: IModel;
  id: RoadId;
  name?: string;
  startNodeId: NodeId;
  endNodeId: NodeId;
  bezierMidPoint: Vector;
  endpoints: [Connection, Connection];
  sections: Map<RoadSectionId, RoadSection>;

  constructor(parent: IModel, id: RoadId, props: RoadProps) {
    this.parent = parent;
    this.id = id;
    this.name = props.name;
    this.startNodeId = props.startNodeId;
    this.endNodeId = props.endNodeId;
    this.bezierMidPoint = props.bezierMidPoint;
    this.endpoints = props.endpoints;
    this.sections = props.sections;
  }

  computeBezier(): QuadBezierPoints | null {
    const { nodes } = this.parent.getState();
    if (!nodes.has(this.startNodeId) || !nodes.has(this.endNodeId)) return null;
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
      s: this.startNodeId,
      e: this.endNodeId,
      b: this.bezierMidPoint,
      p: [serializeConnection(this.endpoints[0]), serializeConnection(this.endpoints[1])],
      c: Array.from(this.sections.values()).map(sec => sec.serialize()),
    };
  }

  static deserialize(ser: SerializedRoad, parent: IModel): Road {
    const sections = new Map<RoadSectionId, RoadSection>();
    for (const sec of ser.c || []) {
      const section = RoadSection.deserialize(sec, parent);
      sections.set(section.id, section);
    }
    return new Road(parent, ser.i as RoadId, {
      name: ser.n,
      startNodeId: ser.s as NodeId,
      endNodeId: ser.e as NodeId,
      bezierMidPoint: ser.b,
      endpoints: [deserializeConnection(ser.p[0]), deserializeConnection(ser.p[1])],
      sections,
    });
  }
}

function serializeConnection(c: Connection): SerializedConnection {
  return { p: c.endpointPos, g: c.groupNumber };
}

function deserializeConnection(c: SerializedConnection): Connection {
  return { endpointPos: c.p, groupNumber: c.g };
}
