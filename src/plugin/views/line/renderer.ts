import { Line, LinePath, MapState, RoadSectionChange, StationStop } from "../../models/structures";
import { StationRenderer } from "../station";
import { hexToRgb } from "@/common/utils/color";
import { SegmentResult } from "./segment-path";
import { isInvalidJump, buildSegmentPath } from "./path-builder";
import { createDashedLine, bezierPathToSegments } from "./segment-nodes";

function collectStops(line: Line): LinePath[] {
  return line.paths.filter(p => p instanceof StationStop);
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
    const stops: LinePath[] = collectStops(line);

    for (let si = 0; si < stops.length - 1; si++) {
      const result = this.renderLineSegment(line, stops[si], stops[si + 1], color);
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
    startStop: LinePath,
    endStop: LinePath,
    color: RGB,
  ): SegmentResult | null {
    const startStation = startStop.renderStop()!;
    const endStation   = endStop.renderStop()!;
    const startPoint = this.stationRenderer.getConnectionPoint(startStation, line, startStop.index);
    const endPoint   = this.stationRenderer.getConnectionPoint(endStation,   line, endStop.index);
    if (!startPoint || !endPoint) {
      console.warn(`Missing connection points for line ${line.id}`);
      return null;
    }

    const rseBetween = line.paths
      .slice(startStop.index + 1, endStop.index)
      .filter(p => p instanceof RoadSectionChange) as unknown as RoadSectionChange[];

    if (isInvalidJump(startStation, endStation, rseBetween)) {
      return { kind: 'dashed', node: createDashedLine(startPoint, endPoint, color) };
    }

    const pathData = buildSegmentPath(line, startStop, endStop, rseBetween, startPoint, endPoint);
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
