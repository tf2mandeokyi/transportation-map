import { Line, MapState, RoadSectionEnter, Station } from "../../models/structures";
import { Model } from "../../models";
import { StationRenderer } from "../station";
import { hexToRgb } from "@/common/utils/color";
import { SegmentResult } from "./segment-path";
import { isInvalidJump, buildSegmentPath } from "./path-builder";
import { createDashedLine, bezierPathToSegments } from "./segment-nodes";

type StopInfo = { pathIdx: number; station: Station };

function collectStopsAndRSEs(
  line: Line, state: Readonly<MapState>
): { stops: StopInfo[]; rsesBefore: RoadSectionEnter[][] } {
  const stops: StopInfo[] = [];
  const rsesBefore: RoadSectionEnter[][] = [];
  let pendingRSEs: RoadSectionEnter[] = [];

  for (const p of line.paths) {
    if (p.kind === 'road-section-enter') {
      pendingRSEs.push(p);
    } else if (p.kind === 'station-stop' && p.stops) {
      const station = state.stations.get(p.stationId);
      if (station) {
        stops.push({ pathIdx: p.index, station });
        rsesBefore.push(pendingRSEs);
        pendingRSEs = [];
      }
    }
  }
  return { stops, rsesBefore };
}

async function cleanupOldLineGroup(line: Line): Promise<void> {
  if (!line.figmaGroupId) return;
  try {
    const oldGroup = await figma.getNodeByIdAsync(line.figmaGroupId);
    if (oldGroup && !oldGroup.removed) oldGroup.remove();
  } catch { /* node may have been deleted */ }
}

export class LineRenderer {
  private readonly stationRenderer: StationRenderer;
  private model: Model | null = null;

  constructor(stationRenderer: StationRenderer) {
    this.stationRenderer = stationRenderer;
  }

  public setModel(model: Model): void {
    this.model = model;
  }

  public async renderLine(line: Line, state: Readonly<MapState>): Promise<void> {
    await cleanupOldLineGroup(line);

    const segmentNodes: SceneNode[] = [];
    const color = hexToRgb(line.color);
    const { stops, rsesBefore } = collectStopsAndRSEs(line, state);

    for (let si = 0; si < stops.length - 1; si++) {
      const { pathIdx: startPathIdx, station: startStation } = stops[si];
      const { pathIdx: endPathIdx,   station: endStation   } = stops[si + 1];
      const result = this.renderLineSegment(
        line, startPathIdx, endPathIdx,
        startStation, endStation, rsesBefore[si + 1], color, state
      );
      if (!result) continue;
      if (result.kind === 'normal') {
        segmentNodes.push(
          figma.group([result.outline], figma.currentPage),
          figma.group([result.main],    figma.currentPage)
        );
      } else {
        segmentNodes.push(figma.group([result.node], figma.currentPage));
      }
    }

    if (segmentNodes.length > 0) {
      const lineGroup = figma.group(segmentNodes, figma.currentPage);
      lineGroup.name   = `Line: ${line.name}`;
      lineGroup.locked = true;
      this.model?.updateLineFigmaGroupId(line.id, lineGroup.id);
    }
  }

  private renderLineSegment(
    line: Line,
    startPathIdx: number,
    endPathIdx: number,
    startStation: Station,
    endStation: Station,
    rseBetween: RoadSectionEnter[],
    color: RGB,
    state: Readonly<MapState>
  ): SegmentResult | null {
    const startPoints = this.stationRenderer.getConnectionPoint(startStation.id, line.id, startPathIdx);
    const endPoints   = this.stationRenderer.getConnectionPoint(endStation.id,   line.id, endPathIdx);
    if (!startPoints || !endPoints) {
      console.warn(`Missing connection points for line ${line.id}`);
      return null;
    }

    if (isInvalidJump(startStation, endStation, rseBetween, state)) {
      return { kind: 'dashed', node: createDashedLine(startPoints.head, endPoints.tail, color) };
    }

    const pathData = buildSegmentPath(
      line, startStation, endStation, rseBetween, startPoints.head, endPoints.tail, state
    );
    return { ...bezierPathToSegments(pathData, color), kind: 'normal' };
  }

  public async moveSegmentsToBack(): Promise<void> {
    if (!this.model) return;
    const state = this.model.getState();
    for (const line of state.lines.values()) {
      if (!line.figmaGroupId) continue;
      try {
        const lineGroup = await figma.getNodeByIdAsync(line.figmaGroupId);
        if (lineGroup && !lineGroup.removed) {
          const parent = lineGroup.parent;
          if (parent && 'insertChild' in parent) parent.insertChild(0, lineGroup as SceneNode);
        }
      } catch {}
    }
  }

  public async clearAllSegments(): Promise<void> {
    if (!this.model) return;
    const state = this.model.getState();
    for (const line of state.lines.values()) {
      if (!line.figmaGroupId) continue;
      try {
        const node = await figma.getNodeByIdAsync(line.figmaGroupId);
        if (node && !node.removed) node.remove();
      } catch { /* node may have been deleted */ }
    }
  }
}
