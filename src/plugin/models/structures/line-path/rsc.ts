import { NodeId, RoadSectionId } from "@/common/types";
import { OffsetT } from "@/plugin/utils/offset-t";
import { RoadSectionPos } from "./base";
import { Node } from "../node";
import { RoadSection } from "../road-section";
import { LinePathData } from "@/common/messages";
import { MapState } from "../map-state";

type LinePathRscFields = Pick<LinePathData, 'fromNodeId' | 'entering' | 'exiting'>;
import { applyLateralOffset } from "@/plugin/utils/math";
import { lineOffsetInSection } from "@/plugin/utils/constants";

export class RoadSectionChange {
  node!: Node;
  exiting!: { section: RoadSection, side: 0 | 1 } | null;
  entering!: { section: RoadSection, side: 0 | 1 } | null;
  exitRank!: number;
  enterRank!: number;

  static fromData(mapState: Readonly<MapState>, data: LinePathRscFields): RoadSectionChange {
    const rsc = new RoadSectionChange();
    rsc.node = mapState.getNodeHarsh(data.fromNodeId);
    rsc.exiting = data.exiting
      ? { section: mapState.getRoadSectionHarsh(data.exiting.sectionId), side: data.exiting.side }
      : null;
    rsc.entering = data.entering
      ? { section: mapState.getRoadSectionHarsh(data.entering.sectionId), side: data.entering.side }
      : null;
    rsc.exitRank = data.exiting?.rank ?? 0;
    rsc.enterRank = data.entering?.rank ?? 0;
    return rsc;
  }

  static fromSerialized(
    mapState: Readonly<MapState>,
    nodeId: NodeId,
    e?: [RoadSectionId, 0 | 1, number],
    x?: [RoadSectionId, 0 | 1, number],
  ): RoadSectionChange {
    const rsc = new RoadSectionChange();
    rsc.node = mapState.getNodeHarsh(nodeId);
    rsc.entering = e ? { section: mapState.getRoadSectionHarsh(e[0]), side: e[1] } : null;
    rsc.exiting = x ? { section: mapState.getRoadSectionHarsh(x[0]), side: x[1] } : null;
    rsc.enterRank = e?.[2] ?? 0;
    rsc.exitRank = x?.[2] ?? 0;
    return rsc;
  }

  toData(): LinePathRscFields {
    return {
      fromNodeId: this.node.id,
      exiting: this.exiting ? { sectionId: this.exiting.section.getRoadSectionId(), side: this.exiting.side, rank: this.exitRank } : null,
      entering: this.entering ? { sectionId: this.entering.section.getRoadSectionId(), side: this.entering.side, rank: this.enterRank } : null,
    };
  }

  serializeEntering(): [RoadSectionId, 0 | 1, number] | undefined {
    return this.entering ? [this.entering.section.getRoadSectionId(), this.entering.side, this.enterRank] : undefined;
  }

  serializeExiting(): [RoadSectionId, 0 | 1, number] | undefined {
    return this.exiting ? [this.exiting.section.getRoadSectionId(), this.exiting.side, this.exitRank] : undefined;
  }

  start(): RoadSectionPos | undefined {
    if (!this.exiting) return undefined;
    return {
      section: this.exiting.section,
      offset: new OffsetT(this.exiting.side, this.exiting.side === 0 ? 'positive' : 'negative')
    }
  }

  end(): RoadSectionPos | undefined {
    if (!this.entering) return undefined;
    return {
      section: this.entering.section,
      offset: new OffsetT(this.entering.side, this.entering.side === 0 ? 'positive' : 'negative')
    }
  }

  computeStartPosition(): Vector | undefined {
    const section = this.entering?.section;
    if (!section) return undefined;
    return this.computePosition(section, this.enterRank);
  }

  computeEndPosition(): Vector | undefined {
    const section = this.exiting?.section;
    if (!section) return undefined;
    return this.computePosition(section, this.exitRank);
  }

  private computePosition(section: RoadSection, rank: number): Vector | undefined {
    const road = section.parentRoad;
    const bezier = road.computeBezier();
    if (!bezier) return undefined;

    const numLines = section.getMaxStationStopCount();

    const totalOffset = section.computeOffset() + lineOffsetInSection(rank, numLines);
    const isStart = road.endpoints[0].node === this.node;
    const ep = road.computeEndpointPos(isStart ? 0 : 1);
    if (totalOffset === 0) return ep;
    return applyLateralOffset(ep, bezier.evalTangent(isStart ? 0 : 1), totalOffset * (isStart ? 1 : -1));
  }
}
