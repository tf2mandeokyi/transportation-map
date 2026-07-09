import { Line, MapState, RoadSectionChange, StationStop } from "../../models/structures";
import { StationRenderer } from "../station";
import { hexToRgb } from "@/common/utils/color";
import { buildSegmentPieces, SegmentPiece } from "./path-builder";
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

    const color = hexToRgb(line.color);
    const stops = collectStops(line);

    // Collected across every station pair so the whole line's solid stretches
    // become one path (outline + main) and its dashed jumps become one more —
    // Figma's dashPattern is per-node, so solid and dashed still need separate
    // nodes, but each style no longer needs a node per segment/piece.
    const solidPaths: string[] = [];
    const dashedJumps: Array<{ from: Vector; to: Vector }> = [];

    for (let si = 0; si < stops.length - 1; si++) {
      const pieces = this.renderLineSegment(line, stops[si], stops[si + 1]);
      for (const piece of pieces) {
        if (piece.kind === 'normal') solidPaths.push(piece.path);
        else dashedJumps.push({ from: piece.from, to: piece.to });
      }
    }

    const segmentNodes: SceneNode[] = [];
    if (solidPaths.length > 0) {
      const { outline, main } = bezierPathToSegments(solidPaths.join(' '), color);
      segmentNodes.push(outline, main);
    }
    if (dashedJumps.length > 0) {
      segmentNodes.push(createDashedLine(dashedJumps, color));
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
  ): SegmentPiece[] {
    const startStation = startStop.stop.station;
    const endStation   = endStop.stop.station;
    const startPoint = this.stationRenderer.getConnectionPoint(startStation, line, startStop.groupIndex, startStop.stopIndex);
    const endPoint   = this.stationRenderer.getConnectionPoint(endStation,   line, endStop.groupIndex,   endStop.stopIndex);
    if (!startPoint || !endPoint) {
      console.warn(`Missing connection points for line ${line.id}`);
      return [];
    }

    const rseBetween = collectRseBetween(line, startStop.groupIndex, endStop.groupIndex);

    // Solid where the RSE chain is continuous; where it breaks, a dashed jump
    // straight between the two nodes the chain actually splits at, so the line
    // still traces as much of the real route as the data supports.
    return buildSegmentPieces(
      line,
      startStop.stop, startStop.groupIndex, startStop.stopIndex,
      endStop.stop,   endStop.groupIndex,   endStop.stopIndex,
      rseBetween, startPoint, endPoint,
    );
  }

  // Re-appending each line group moves it to the top of its parent's z-order,
  // above the road infrastructure brought to front just before this runs.
  public async bringSegmentsToFront(state: Readonly<MapState>): Promise<void> {
    for (const line of state.getLines()) {
      if (!line.figmaGroupId) continue;
      try {
        const lineGroup = await figma.getNodeByIdAsync(line.figmaGroupId);
        if (lineGroup && !lineGroup.removed) {
          const parent = lineGroup.parent;
          if (parent && 'appendChild' in parent) parent.appendChild(lineGroup as SceneNode);
        }
      } catch {}
    }
  }
}
