import { Line, MapState, PassStop, RoadSectionPass } from "../../models/structures";
import { StationRenderer } from "../station";
import { hexToRgb } from "@/common/utils/color";
import { buildSegmentPieces, SegmentPiece } from "./path-builder";
import { createDashedLine, bezierPathToSegments } from "./segment-nodes";

type IndexedStop = { stop: PassStop; pass: RoadSectionPass; passIndex: number };

function collectStops(line: Line): IndexedStop[] {
  const result: IndexedStop[] = [];
  line.paths.forEach((pass, passIndex) => {
    pass.stops.forEach(stop => {
      result.push({ stop, pass, passIndex });
    });
  });
  return result;
}

// Passes strictly between two stops, in order.
function collectPassesBetween(line: Line, startPassIndex: number, endPassIndex: number): RoadSectionPass[] {
  return line.paths.slice(startPassIndex + 1, endPassIndex);
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
    const startPoint = this.stationRenderer.getConnectionPoint(startStation, line, startStop.passIndex);
    const endPoint   = this.stationRenderer.getConnectionPoint(endStation,   line, endStop.passIndex);
    if (!startPoint || !endPoint) {
      console.warn(`Missing connection points for line ${line.id}`);
      return [];
    }

    const passesBetween = collectPassesBetween(line, startStop.passIndex, endStop.passIndex);

    // Solid where the pass chain is continuous; where it breaks, a dashed jump
    // straight between the two nodes the chain actually splits at, so the line
    // still traces as much of the real route as the data supports.
    return buildSegmentPieces(
      line,
      startStop.stop, startStop.pass, startStop.passIndex,
      endStop.stop,   endStop.pass,   endStop.passIndex,
      passesBetween, startPoint, endPoint,
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
