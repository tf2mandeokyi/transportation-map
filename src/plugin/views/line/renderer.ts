import { Line, MapState, RoadSectionChange, Station } from "../../models/structures";
import { StationRenderer } from "../station";
import { hexToRgb } from "@/common/utils/color";
import { SegmentResult } from "./segment-path";
import { isInvalidJump, buildSegmentPath } from "./path-builder";
import { createDashedLine, bezierPathToSegments } from "./segment-nodes";

type StopInfo = { pathIdx: number; station: Station };

function collectStopsAndRSEs(
  line: Line,
): { stops: StopInfo[]; rsesBefore: RoadSectionChange[][] } {
  const stops: StopInfo[] = [];
  const rsesBefore: RoadSectionChange[][] = [];
  let pendingRSEs: RoadSectionChange[] = [];

  for (const p of line.paths) {
    if (p.kind === 'road-section-change') {
      pendingRSEs.push(p);
    } else if (p.kind === 'station-stop') {
      stops.push({ pathIdx: p.index, station: p.station });
      rsesBefore.push(pendingRSEs);
      pendingRSEs = [];
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

  constructor(stationRenderer: StationRenderer) {
    this.stationRenderer = stationRenderer;
  }

  public async renderLine(line: Line): Promise<void> {
    await cleanupOldLineGroup(line);

    const segmentNodes: SceneNode[] = [];
    const color = hexToRgb(line.color);
    const { stops, rsesBefore } = collectStopsAndRSEs(line);

    for (let si = 0; si < stops.length - 1; si++) {
      const { pathIdx: startPathIdx, station: startStation } = stops[si];
      const { pathIdx: endPathIdx,   station: endStation   } = stops[si + 1];

      const result = this.renderLineSegment(
        line, startPathIdx, endPathIdx,
        startStation, endStation, rsesBefore[si + 1], color
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
      line.figmaGroupId = lineGroup.id;
    }
  }

  private renderLineSegment(
    line: Line,
    startPathIdx: number,
    endPathIdx: number,
    startStation: Station,
    endStation: Station,
    rseBetween: RoadSectionChange[],
    color: RGB
  ): SegmentResult | null {
    const startPoint = this.stationRenderer.getConnectionPoint(startStation, line, startPathIdx);
    const endPoint   = this.stationRenderer.getConnectionPoint(endStation,   line, endPathIdx);
    if (!startPoint || !endPoint) {
      console.warn(`Missing connection points for line ${line.id}`);
      return null;
    }

    if (isInvalidJump(startStation, endStation, rseBetween)) {
      return { kind: 'dashed', node: createDashedLine(startPoint, endPoint, color) };
    }

    const pathData = buildSegmentPath(
      line, startStation, endStation, rseBetween, startPoint, endPoint,
      startPathIdx, endPathIdx,
    );
    return { ...bezierPathToSegments(pathData, color), kind: 'normal' };
  }

  public async moveSegmentsToBack(state: Readonly<MapState>): Promise<void> {
    for (const line of state.getLines()) {
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
}
