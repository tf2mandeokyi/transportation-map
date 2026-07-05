import { Line, MapState, RoadSectionChange, StationStop } from "../../models/structures";
import { StationRenderer } from "../station";
import { hexToRgb } from "@/common/utils/color";
import { SegmentResult } from "./segment-path";
import { isInvalidJump, buildSegmentPath } from "./path-builder";
import { createDashedLine, bezierPathToSegments } from "./segment-nodes";

type IndexedStop = { stop: StationStop; groupIndex: number; stopIndex: number };

function collectStops(line: Line): IndexedStop[] {
  const result: IndexedStop[] = [];
  line.paths.forEach((group, groupIndex) => {
    group.stationStops.forEach((stop, stopIndex) => {
      result.push({ stop, groupIndex, stopIndex });
    });
  });
  return result;
}

// RSCs strictly between two stops, in order — every group's RSC from just after
// the start stop's group through the end stop's group (inclusive) always sits
// before that group's own stops, so it lies between the two addressed stops.
function collectRseBetween(line: Line, startGroupIndex: number, endGroupIndex: number): RoadSectionChange[] {
  const result: RoadSectionChange[] = [];
  for (let gi = startGroupIndex + 1; gi <= endGroupIndex; gi++) {
    const rsc = line.paths[gi]?.fromRoadSectionChange;
    if (rsc) result.push(rsc);
  }
  return result;
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
    const stops = collectStops(line);

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
    startStop: IndexedStop,
    endStop: IndexedStop,
    color: RGB,
  ): SegmentResult | null {
    const startStation = startStop.stop.station;
    const endStation   = endStop.stop.station;
    const startPoint = this.stationRenderer.getConnectionPoint(startStation, line, startStop.groupIndex, startStop.stopIndex);
    const endPoint   = this.stationRenderer.getConnectionPoint(endStation,   line, endStop.groupIndex,   endStop.stopIndex);
    if (!startPoint || !endPoint) {
      console.warn(`Missing connection points for line ${line.id}`);
      return null;
    }

    const rseBetween = collectRseBetween(line, startStop.groupIndex, endStop.groupIndex);

    if (isInvalidJump(startStation, endStation, rseBetween)) {
      return { kind: 'dashed', node: createDashedLine(startPoint, endPoint, color) };
    }

    const pathData = buildSegmentPath(
      line,
      startStop.stop, startStop.groupIndex, startStop.stopIndex,
      endStop.stop,   endStop.groupIndex,   endStop.stopIndex,
      rseBetween, startPoint, endPoint,
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
