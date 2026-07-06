import { RoadId, SectionId } from "@/common/types";
import { QuadBezierPoints } from '../../utils/bezier';
import { TransportationMapObject } from './types';
import { RoadSection, SerializedRoadSection } from './road-section';
import { own, Owned } from "@/common/utils/ownership";
import { Connection, deserializeConnection, serializeConnection, SerializedConnection } from "./connection";
import { Node } from "./node";
import { normalize, perp } from "../../utils/math";

export interface SerializedRoad {
  n?: string;                                         // name
  b: { x: number; y: number };                        // bezierMidPoint
  p: [SerializedConnection, SerializedConnection];    // endpoints
  c: Record<SectionId, SerializedRoadSection>;        // sections
}

export interface RoadProps {
  name?: string;
  bezierMidPoint: Vector;
  endpoints: [Owned<Connection>, Owned<Connection>];
}

export class Road extends TransportationMapObject<RoadId> {
  name?: string;
  bezierMidPoint!: Vector;
  private _endpoints!: [Owned<Connection>, Owned<Connection>];
  private readonly sections: Map<SectionId, Owned<RoadSection>> = new Map();

  get endpoints(): [Connection, Connection] {
    return [this._endpoints[0], this._endpoints[1]];
  }

  applyProps(props: RoadProps): this {
    this.name = props.name;
    this.bezierMidPoint = props.bezierMidPoint;
    this._endpoints = [own(props.endpoints[0]), own(props.endpoints[1])];
    return this;
  }

  applySerialized(ser: SerializedRoad): this {
    this.name = ser.n;
    this.bezierMidPoint = ser.b;

    const endpoint0 = deserializeConnection(this.mapState, ser.p[0]);
    const endpoint1 = deserializeConnection(this.mapState, ser.p[1]);
    endpoint0.node.addRoadConnection(this, 0);
    endpoint1.node.addRoadConnection(this, 1);
    this._endpoints = [own(endpoint0), own(endpoint1)];

    for (const secId in ser.c) {
      const secSer = ser.c[secId as SectionId];
      this.sections.get(secId as SectionId)!.applySerialized(this, secSer);
    }
    return this;
  }

  serialize(): SerializedRoad {
    return {
      n: this.name,
      b: this.bezierMidPoint,
      p: [serializeConnection(this.endpoints[0]), serializeConnection(this.endpoints[1])],
      c: Object.fromEntries([...this.sections.entries()].map(([secId, sec]) => [secId, sec.serialize()])),
    };
  }

  *getSections(): IterableIterator<RoadSection> {
    for (const section of this.sections.values()) yield section;
  }

  getSectionsByIndex(): Array<RoadSection> {
    return [...this.getSections()].sort((a, b) => a.index - b.index);
  }

  getSectionHarsh(sectionId: SectionId | undefined): RoadSection {
    if (!sectionId) throw new Error(`SectionId is undefined`);
    const section = this.sections.get(sectionId);
    if (!section) throw new Error(`Section with ID ${sectionId} not found`);
    return section;
  }

  getSectionByIndex(index: number): RoadSection | undefined {
    for (const section of this.getSections()) {
      if (section.index === index) {
        return section;
      }
    }
    return undefined;
  }

  hasSection(id: SectionId): boolean { return this.sections.has(id); }

  addSection(section: RoadSection): void {
    this.sections.set(section.id, own(section));
  }

  removeSection(section: RoadSection): void {
    this.sections.delete(section.id);
  }

  computeBezier(): QuadBezierPoints | null {
    if (!this.endpoints[0].node || !this.endpoints[1].node) return null;
    return new QuadBezierPoints(
      this.computeEndpointPos(0),
      this.bezierMidPoint,
      this.computeEndpointPos(1),
    );
  }

  // Connection position on a node's boundary circle: nodePosition + radius*normal + horizontalOffset*tangent,
  // where normal points from the node's center out toward this road's bezier midpoint.
  computeEndpointPos(endpointIndex: 0 | 1): Vector {
    const conn = this.endpoints[endpointIndex];
    const node = conn.node;
    const normal = normalize({ x: this.bezierMidPoint.x - node.position.x, y: this.bezierMidPoint.y - node.position.y });
    const tangent = perp(normal);
    return {
      x: node.position.x + normal.x * node.radius + tangent.x * conn.horizontalOffset,
      y: node.position.y + normal.y * node.radius + tangent.y * conn.horizontalOffset,
    };
  }

  findSharedNode(roadB: Road): Node | null {
    if (this.endpoints[1].node === roadB.endpoints[0].node || this.endpoints[1].node === roadB.endpoints[1].node) return this.endpoints[1].node;
    if (this.endpoints[0].node === roadB.endpoints[0].node || this.endpoints[0].node === roadB.endpoints[1].node) return this.endpoints[0].node;
    return null;
  }
}