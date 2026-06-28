import { NodeId, RoadId, SectionId } from "@/common/types";
import { QuadBezierPoints } from '../../utils/bezier';
import { TransportationMapObject } from './types';
import { RoadSection, SerializedRoadSection } from './road-section';
import type { Node } from './node';
import { MapState } from "./map-state";
import { own, Owned } from "@/common/utils/ownership";

interface SerializedConnection {
  n: NodeId;                   // nodeId
  p: { x: number; y: number }; // endpointPos
  g: number;                   // groupNumber
}

export interface Connection {
  node: Node;
  endpointPos: Vector;
  groupNumber: number;
}

function serializeConnection(c: Connection): SerializedConnection {
  return { n: c.node.id, p: c.endpointPos, g: c.groupNumber };
}

function deserializeConnection(mapState: Readonly<MapState>, c: SerializedConnection): Connection {
  return { node: mapState.getNodeHarsh(c.n), endpointPos: c.p, groupNumber: c.g };
}

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
  endpoints!: [Owned<Connection>, Owned<Connection>];
  private readonly sections: Map<SectionId, Owned<RoadSection>> = new Map();

  applyProps(props: RoadProps): this {
    this.name = props.name;
    this.bezierMidPoint = props.bezierMidPoint;
    this.endpoints = props.endpoints;
    return this;
  }

  applySerialized(ser: SerializedRoad): this {
    this.name = ser.n;
    this.bezierMidPoint = ser.b;

    const endpoint0 = deserializeConnection(this.mapState, ser.p[0]);
    const endpoint1 = deserializeConnection(this.mapState, ser.p[1]);
    endpoint0.node.addRoadConnection(this, 0);
    endpoint1.node.addRoadConnection(this, 1);
    this.endpoints = [own(endpoint0), own(endpoint1)];

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

  getSections(): IterableIterator<RoadSection> {
    return this.sections.values();
  }

  getSectionsByIndex(): Array<RoadSection> {
    return [...this.sections.values()].sort((a, b) => a.index - b.index);
  }

  getSectionHarsh(sectionId: SectionId | undefined): RoadSection {
    if (!sectionId) throw new Error(`SectionId is undefined`);
    const section = this.sections.get(sectionId);
    if (!section) throw new Error(`Section with ID ${sectionId} not found`);
    return section;
  }

  getSectionByIndex(index: number): RoadSection | undefined {
    for (const section of this.sections.values()) {
      if (section.index === index) {
        return section;
      }
    }
    return undefined;
  }

  hasSection(id: SectionId): boolean { return this.sections.has(id); }

  addSection(section: Owned<RoadSection>): void {
    this.sections.set(section.id, section);
  }

  removeSection(section: RoadSection): void {
    this.sections.delete(section.id);
  }

  computeBezier(): QuadBezierPoints | null {
    if (!this.endpoints[0].node || !this.endpoints[1].node) return null;
    return new QuadBezierPoints(
      this.endpoints[0].endpointPos,
      this.bezierMidPoint,
      this.endpoints[1].endpointPos,
    );
  }
}