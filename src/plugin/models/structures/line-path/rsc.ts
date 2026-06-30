import { OffsetT } from "@/plugin/utils/offset-t";
import { PathEntry } from "@/plugin/utils/path-entry";
import { SerializedLinePath } from "./base";
import { Line } from "../line";
import { MapState } from "../map-state";
import { Node } from "../node";
import { RoadSection } from "../road-section";
import { LinePath } from "./base";
import { LinePathData } from "@/common/messages";

export class RoadSectionChange extends LinePath {
  mapState: Readonly<MapState>;
  node!: Node;
  exiting!: { section: RoadSection, side: 0 | 1 } | null;
  entering!: { section: RoadSection, side: 0 | 1 } | null;
  exitRank!: number;
  enterRank!: number;

  constructor(mapState: Readonly<MapState>) {
    super();
    this.mapState = mapState;
  }

  applySerialized(ser: Extract<SerializedLinePath, { k: 'sc' }>): this {
    if (!ser.n) throw new Error(`Serialized RoadSectionChange is missing nodeId: ${JSON.stringify(ser)}`);
    this.node = this.mapState.getNodeHarsh(ser.n);
    this.exiting = ser.e ? { section: this.mapState.getRoadSectionHarsh(ser.e[0]), side: ser.e[1] } : null;
    this.entering = ser.a ? { section: this.mapState.getRoadSectionHarsh(ser.a[0]), side: ser.a[1] } : null;
    this.exitRank = ser.f ?? 0;
    this.enterRank = ser.g ?? 0;
    return this;
  }
  
  applyData(data: Extract<LinePathData, { kind: 'road-section-change' }>): this {
    this.node = this.mapState.getNodeHarsh(data.nodeId);
    this.exiting = data.exiting
      ? { section: this.mapState.getRoadSectionHarsh(data.exiting.sectionId), side: data.exiting.side }
      : null;
    this.entering = data.entering
      ? { section: this.mapState.getRoadSectionHarsh(data.entering.sectionId), side: data.entering.side }
      : null;
    this.exitRank = 0;
    this.enterRank = 0;
    return this;
  }

  toData(): LinePathData {
    return {
      kind: 'road-section-change',
      index: this.index,
      nodeId: this.node.id,
      exiting: this.exiting ? { sectionId: this.exiting.section.getRoadSectionId(), side: this.exiting.side } : null,
      entering: this.entering ? { sectionId: this.entering.section.getRoadSectionId(), side: this.entering.side } : null,
    };
  }

  serialize(): SerializedLinePath {
    return {
      k: 'sc',
      n: this.node.id,
      e: this.exiting ? [this.exiting.section.getRoadSectionId(), this.exiting.side] : undefined,
      a: this.entering ? [this.entering.section.getRoadSectionId(), this.entering.side] : undefined,
      f: this.exitRank,
      g: this.enterRank,
    };
  }

  start() {
    if (!this.exiting) return undefined;
    return {
      section: this.exiting.section,
      offset: new OffsetT(this.exiting.side, this.exiting.side === 0 ? 'positive' : 'negative')
    }
  }

  end() {
    if (!this.entering) return undefined;
    return {
      section: this.entering.section,
      offset: new OffsetT(this.entering.side, this.entering.side === 0 ? 'positive' : 'negative')
    }
  }

  renderStop() { return null; }

  computeEntry(line: Line): PathEntry<this> {
    const entry = this?.exiting ?? this?.entering;
    const section = entry?.section ?? null;
    const road = section?.parentRoad ?? null;
    const rank = this?.exiting === null ? (this?.enterRank ?? 0) : (this?.exitRank ?? 0);
    return new PathEntry(line, this, rank, road, section);
  }
}
