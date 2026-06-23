import { Line, MapState, RoadSectionChange, Station } from "../../models/structures";
import { Model } from "../../models";
import { StationRenderer } from "../station";
import { hexToRgb } from "@/common/utils/color";
import { SegmentResult } from "./segment-path";
import { isInvalidJump, buildSegmentPath } from "./path-builder";
import { createDashedLine, bezierPathToSegments } from "./segment-nodes";
import { evalQuadraticBezierTangent } from "../../utils/bezier";
import { LINE_SPACING } from "../../utils/constants";
import { computeRoadBezier, findRoadForSection, getLineDirectionAtStop, getLineDepartureAtStop } from "../../utils/section";

type StopInfo = { pathIdx: number; station: Station };

function collectStopsAndRSEs(
  line: Line, state: Readonly<MapState>
): { stops: StopInfo[]; rsesBefore: RoadSectionChange[][] } {
  const stops: StopInfo[] = [];
  const rsesBefore: RoadSectionChange[][] = [];
  let pendingRSEs: RoadSectionChange[] = [];

  for (const p of line.paths) {
    if (p.kind === 'road-section-change') {
      pendingRSEs.push(p);
    } else if (p.kind === 'station-stop') {
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

      const startArrDir = getLineDirectionAtStop(line, startPathIdx, state);
      const startDepDir = getLineDepartureAtStop(line, startPathIdx, state);
      const isStartUturnDep = startDepDir !== null && startDepDir !== startArrDir;

      if (isStartUturnDep) {
        const uturn = this.renderUturnCurve(startStation, startPathIdx, line, color, state);
        if (uturn) {
          segmentNodes.push(
            figma.group([uturn.outline], figma.currentPage),
            figma.group([uturn.main],    figma.currentPage)
          );
        }
      }

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
    rseBetween: RoadSectionChange[],
    color: RGB,
    state: Readonly<MapState>
  ): SegmentResult | null {
    const startArrDir = getLineDirectionAtStop(line, startPathIdx, state);
    const startDepDir = getLineDepartureAtStop(line, startPathIdx, state);
    const isStartUturnDep = startDepDir !== null && startDepDir !== startArrDir;

    const startPoint = this.stationRenderer.getConnectionPoint(startStation.id, line.id, startPathIdx, isStartUturnDep);
    const endPoint   = this.stationRenderer.getConnectionPoint(endStation.id,   line.id, endPathIdx);
    if (!startPoint || !endPoint) {
      console.warn(`Missing connection points for line ${line.id}`);
      return null;
    }

    if (isInvalidJump(startStation, endStation, rseBetween, state)) {
      return { kind: 'dashed', node: createDashedLine(startPoint, endPoint, color) };
    }

    const pathData = buildSegmentPath(
      line, startStation, endStation, rseBetween, startPoint, endPoint, state,
      startPathIdx, endPathIdx,
    );
    return { ...bezierPathToSegments(pathData, color), kind: 'normal' };
  }

  private renderUturnCurve(
    station: Station,
    pathIdx: number,
    line: Line,
    color: RGB,
    state: Readonly<MapState>,
  ): { outline: VectorNode; main: VectorNode } | null {
    const arrPoint = this.stationRenderer.getConnectionPoint(station.id, line.id, pathIdx);
    const depPoint = this.stationRenderer.getConnectionPoint(station.id, line.id, pathIdx, true);
    if (!arrPoint || !depPoint) return null;

    if (!station.roadSectionId) return null;
    const road = findRoadForSection(station.roadSectionId, state);
    if (!road) return null;
    const centerline = computeRoadBezier(road, state);
    if (!centerline) return null;

    const arrDir = getLineDirectionAtStop(line, pathIdx, state);
    const tan = evalQuadraticBezierTangent(centerline, station.interpT);
    const tanLen = Math.hypot(tan.x, tan.y) || 1;
    // Outward direction: the forward travel direction at the terminus so the cap
    // curves away from the rest of the line.
    const sign = arrDir === 'forward' ? 1 : -1;
    const outX = (sign * tan.x) / tanLen;
    const outY = (sign * tan.y) / tanLen;

    const dist = Math.hypot(depPoint.x - arrPoint.x, depPoint.y - arrPoint.y);
    // Outward reach of the cap — larger than the semicircle minimum so the U-turn
    // is clearly visible. ctrl drives both control arms equally.
    const ctrl = Math.max(LINE_SPACING * 1.5, dist);

    const pathData = [
      `M ${arrPoint.x} ${arrPoint.y}`,
      `C ${arrPoint.x + outX * ctrl} ${arrPoint.y + outY * ctrl}`,
      `  ${depPoint.x + outX * ctrl} ${depPoint.y + outY * ctrl}`,
      `  ${depPoint.x} ${depPoint.y}`,
    ].join(' ');
    return bezierPathToSegments(pathData, color);
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
