import { Line, MapState, Road, RoadSectionEnter, Station } from "../models/structures";
import { Model } from "../models";
import { StationRenderer } from "./station";
import { RoadSectionId, StationId } from "@/common/types";
import {
  elevateToCubic,
  evalQuadraticBezier,
  evalQuadraticBezierTangent,
  offsetBezierAdaptive,
  subQuadBezier,
  QuadBezierPoints,
  CubicBezierPoints,
  TRACK_SPACING,
} from "../utils/bezier";
import { JunctionShape } from "../utils/junction-shape";
import { PathBuilder } from "../utils/path";
import {
  computeRoadBezier,
  findRoadForSection,
  getLinesForSection,
  lineOffsetInSection,
} from "../utils/section";
import { hexToRgb } from "@/common/utils/color";

type SegmentResult =
  | { kind: 'normal'; outline: VectorNode; main: VectorNode }
  | { kind: 'dashed'; node: VectorNode };

// Total lateral offset from the road centerline for this line on this section.
// referenceStationId: which station's stop ranks to use for lane ordering (the
// departure station of the current inter-station segment).
function computeTotalOffset(
  line: Line, road: Road, sectionId: RoadSectionId,
  state: Readonly<MapState>,
  referenceStationId?: StationId,
): number {
  const section = road.sections.get(sectionId);
  if (!section) return 0;

  const sections = Array.from(road.sections.values());
  const center = (sections.length - 1) / 2;
  const sectionOffset = (section.index - center) * TRACK_SPACING;

  const lines = getLinesForSection(section, state, referenceStationId);
  const lineIndex = lines.findIndex(l => l.id === line.id);
  const effectiveIdx   = lineIndex >= 0 ? lineIndex   : lines.length;
  const effectiveCount = lineIndex >= 0 ? lines.length : lines.length + 1;
  const lineOffset = lineOffsetInSection(effectiveIdx, Math.max(effectiveCount, 1));

  return sectionOffset + lineOffset;
}

// Builds a single cubic bezier that starts at offsetAtT1 from the centerline at t1
// and ends at offsetAtT2 from the centerline at t2, following the road tangents.
// Used for crossing segments where the line changes lateral lane between stations.
function computeCrossingSeg(
  centerline: QuadBezierPoints,
  t1: number, t2: number,
  offsetAtT1: number, offsetAtT2: number,
): CubicBezierPoints {
  const sign = t1 > t2 ? -1 : 1;

  const pos1 = evalQuadraticBezier(centerline, t1);
  const pos2 = evalQuadraticBezier(centerline, t2);
  const tan1 = evalQuadraticBezierTangent(centerline, t1);
  const tan2 = evalQuadraticBezierTangent(centerline, t2);

  const len1 = Math.hypot(tan1.x, tan1.y) || 1;
  const len2 = Math.hypot(tan2.x, tan2.y) || 1;

  // Perpendicular (90° CCW from centerline tangent), flipped for reverse traversal.
  const perp1x = -tan1.y / len1 * sign;
  const perp1y =  tan1.x / len1 * sign;
  const perp2x = -tan2.y / len2 * sign;
  const perp2y =  tan2.x / len2 * sign;

  const p0 = { x: pos1.x + perp1x * offsetAtT1, y: pos1.y + perp1y * offsetAtT1 };
  const p3 = { x: pos2.x + perp2x * offsetAtT2, y: pos2.y + perp2y * offsetAtT2 };

  // Control points follow the road tangent direction so the curve stays on-road.
  const chord = Math.hypot(p3.x - p0.x, p3.y - p0.y);
  const ctrlLen = Math.max(chord / 3, 1);
  const p1 = { x: p0.x + tan1.x / len1 * sign * ctrlLen, y: p0.y + tan1.y / len1 * sign * ctrlLen };
  const p2 = { x: p3.x - tan2.x / len2 * sign * ctrlLen, y: p3.y - tan2.y / len2 * sign * ctrlLen };

  return { p0, p1, p2, p3 };
}

// Returns the offset bezier segments for one road-section sub-range.
// departureStationId / arrivalStationId: the stations at t1 and t2 respectively.
// When both are provided and the line's lateral offset differs between them, a
// crossing cubic is returned so the line smoothly transitions lanes.
function computeSectionSegs(
  line: Line, road: Road, sectionId: RoadSectionId,
  t1: number, t2: number,
  state: Readonly<MapState>,
  departureStationId?: StationId,
  arrivalStationId?: StationId,
): CubicBezierPoints[] {
  const centerline = computeRoadBezier(road, state);
  if (!centerline) return [];

  const offsetDep = computeTotalOffset(line, road, sectionId, state, departureStationId);
  const offsetArr = arrivalStationId === undefined
    ? offsetDep
    : computeTotalOffset(line, road, sectionId, state, arrivalStationId);

  // Normalize offsets for traversal direction (reverse → negate perpendicular).
  const directedDep = t1 > t2 ? -offsetDep : offsetDep;
  const directedArr = t1 > t2 ? -offsetArr : offsetArr;

  if (directedDep === directedArr) {
    // Non-crossing: adaptive offset for best accuracy.
    const sub = elevateToCubic(subQuadBezier(centerline, t1, t2));
    return directedDep === 0 ? [sub] : offsetBezierAdaptive(sub, directedDep);
  }

  // Crossing: single cubic that transitions from departure lane to arrival lane.
  return [computeCrossingSeg(centerline, t1, t2, directedDep, directedArr)];
}

function appendJunctionCurve(pb: PathBuilder, prev: CubicBezierPoints, next: CubicBezierPoints): void {
  // Tangent at t=1 of cubic: p3 - p2
  const exitLen = Math.hypot(prev.p3.x - prev.p2.x, prev.p3.y - prev.p2.y);
  const exitDir: Vector = exitLen < 0.001
    ? { x: 1, y: 0 }
    : { x: (prev.p3.x - prev.p2.x) / exitLen, y: (prev.p3.y - prev.p2.y) / exitLen };

  // Tangent at t=0 of cubic: p1 - p0 (negated for "into junction" direction)
  const entryLen = Math.hypot(next.p1.x - next.p0.x, next.p1.y - next.p0.y);
  const entryDir: Vector = entryLen < 0.001
    ? { x: -1, y: 0 }
    : { x: -(next.p1.x - next.p0.x) / entryLen, y: -(next.p1.y - next.p0.y) / entryLen };

  JunctionShape.appendGapCurve(pb, prev.p3, exitDir, next.p0, entryDir);
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
    await this.cleanupOldLineGroup(line);

    const segmentNodes: SceneNode[] = [];
    const color = hexToRgb(line.color);

    // Collect station stops with the RoadSectionEnter entries that precede each one.
    // This allows segments between non-adjacent station stops (separated by RSE entries)
    // to follow the correct roads.
    type StopInfo = { pathIdx: number; station: Station };
    const stops: StopInfo[] = [];
    const rsesBefore: RoadSectionEnter[][] = []; // rsesBefore[i] = RSEs collected before stops[i]
    let pendingRSEs: RoadSectionEnter[] = [];

    for (const p of line.paths) {
      if (p.kind === 'road-section-enter') {
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

    for (let si = 0; si < stops.length - 1; si++) {
      const { pathIdx: startPathIdx, station: startStation } = stops[si];
      const { pathIdx: endPathIdx, station: endStation } = stops[si + 1];
      const rseBetween = rsesBefore[si + 1];

      const result = this.renderLineSegment(
        line, startPathIdx, endPathIdx,
        startStation, endStation, rseBetween, color, state
      );
      if (!result) continue;
      if (result.kind === 'normal') {
        segmentNodes.push(
          figma.group([result.outline], figma.currentPage),
          figma.group([result.main], figma.currentPage)
        );
      } else {
        segmentNodes.push(figma.group([result.node], figma.currentPage));
      }
    }

    if (segmentNodes.length > 0) {
      const lineGroup = figma.group(segmentNodes, figma.currentPage);
      lineGroup.name = `Line: ${line.name}`;
      lineGroup.locked = true;

      if (this.model) {
        this.model.updateLineFigmaGroupId(line.id, lineGroup.id);
      }
    }
  }

  private async cleanupOldLineGroup(line: Line): Promise<void> {
    if (line.figmaGroupId) {
      try {
        const oldGroup = await figma.getNodeByIdAsync(line.figmaGroupId);
        if (oldGroup && !oldGroup.removed) oldGroup.remove();
      } catch { /* node may have been deleted */ }
    }
  }

  private isInvalidJump(
    startStation: Station,
    endStation: Station,
    rseBetween: RoadSectionEnter[],
    state: Readonly<MapState>
  ): boolean {
    if (!startStation.roadSectionId || !endStation.roadSectionId) return false;
    const startRoad = findRoadForSection(startStation.roadSectionId, state);
    const endRoad   = findRoadForSection(endStation.roadSectionId,   state);
    if (!startRoad || !endRoad || startRoad.id === endRoad.id) return false;
    return rseBetween.length === 0;
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

    if (this.isInvalidJump(startStation, endStation, rseBetween, state)) {
      return { kind: 'dashed', node: this.createDashedLine(startPoints.head, endPoints.tail, color) };
    }

    const pathData = this.buildSegmentPath(
      line, startStation, endStation, rseBetween,
      startPoints.head, endPoints.tail, state
    );
    return { ...this.bezierPathToSegments(pathData, color), kind: 'normal' };
  }

  private buildSegmentPath(
    line: Line,
    startStation: Station,
    endStation: Station,
    rseBetween: RoadSectionEnter[],
    headCanvas: Vector,
    tailCanvas: Vector,
    state: Readonly<MapState>
  ): string {
    const startSectionId = startStation.roadSectionId;
    const endSectionId = endStation.roadSectionId;

    if (!startSectionId || !endSectionId) {
      return `M ${headCanvas.x} ${headCanvas.y} L ${tailCanvas.x} ${tailCanvas.y}`;
    }

    const startRoad = findRoadForSection(startSectionId, state);
    const endRoad   = findRoadForSection(endSectionId,   state);
    if (!startRoad || !endRoad) return `M ${headCanvas.x} ${headCanvas.y} L ${tailCanvas.x} ${tailCanvas.y}`;

    const fallback = new PathBuilder().moveTo(headCanvas).lineTo(tailCanvas).build();

    // Build the ordered road sequence from the RSE chain.
    const roadSeq: Road[] = [startRoad];
    for (const rse of rseBetween) {
      const road = state.roads.get(rse.destRoadId);
      if (road && roadSeq[roadSeq.length - 1].id !== road.id) roadSeq.push(road);
    }
    if (roadSeq[roadSeq.length - 1].id !== endRoad.id) roadSeq.push(endRoad);

    // Index RSEs by destRoadId so we can look up the entry node for each road.
    const rseByDest = new Map(rseBetween.map(rse => [rse.destRoadId, rse]));

    // Single-road fast path.
    if (roadSeq.length === 1) {
      const segs = computeSectionSegs(
        line, startRoad, startSectionId, startStation.interpT, endStation.interpT, state,
        startStation.id, endStation.id,
      );
      if (segs.length === 0) return fallback;
      return new PathBuilder().beziers(segs).build();
    }

    // Multi-road: collect offset segments per road, chain with smooth junction curves.
    const entries: CubicBezierPoints[][] = [];

    for (let i = 0; i < roadSeq.length; i++) {
      const road = roadSeq[i];

      // Section: use station-defined section for start/end roads; first section otherwise.
      let sectionId: RoadSectionId;
      if (i === 0) {
        sectionId = startSectionId;
      } else if (i === roadSeq.length - 1) {
        sectionId = endSectionId;
      } else {
        const firstSec = road.sections.values().next().value;
        if (!firstSec) continue;
        sectionId = firstSec.id;
      }

      // Entry T: start station's interpT for the first road; RSE node position for the rest.
      let entryT: number;
      if (i === 0) {
        entryT = startStation.interpT;
      } else {
        const rse = rseByDest.get(road.id);
        if (!rse) continue;
        entryT = rse.nodeId === road.startNodeId ? 0 : 1;
      }

      // Exit T: end station's interpT for the last road; next RSE node position otherwise.
      let exitT: number;
      if (i === roadSeq.length - 1) {
        exitT = endStation.interpT;
      } else {
        const rse = rseByDest.get(roadSeq[i + 1].id);
        if (!rse) continue;
        exitT = rse.nodeId === road.endNodeId ? 1 : 0;
      }

      const depId = i === 0 ? startStation.id : undefined;
      const arrId = i === roadSeq.length - 1 ? endStation.id : undefined;
      const segs = computeSectionSegs(line, road, sectionId, entryT, exitT, state, depId, arrId);
      if (segs.length === 0) continue;
      entries.push(segs);
    }

    if (entries.length === 0) return fallback;

    const pb = new PathBuilder().beziers(entries[0]);
    for (let i = 1; i < entries.length; i++) {
      const prevSegs = entries[i - 1];
      const currSegs = entries[i];
      appendJunctionCurve(pb, prevSegs[prevSegs.length - 1], currSegs[0]);
      for (const { p1, p2, p3 } of currSegs) pb.cubicTo(p1, p2, p3);
    }
    return pb.build();
  }

  private createDashedLine(from: Vector, to: Vector, color: RGB): VectorNode {
    const path = `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
    const node = figma.createVector();
    node.vectorPaths = [{ windingRule: 'NONZERO', data: path }];
    node.strokes = [{ type: 'SOLID', color }];
    node.strokeWeight = 2;
    node.strokeCap = 'ROUND';
    node.dashPattern = [4, 5];
    return node;
  }

  private bezierPathToSegments(pathData: string, color: RGB): { outline: VectorNode; main: VectorNode } {
    const outlineNode = figma.createVector();
    outlineNode.vectorPaths = [{ windingRule: 'NONZERO', data: pathData }];
    outlineNode.strokes = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
    outlineNode.strokeWeight = 4;
    outlineNode.strokeCap = 'ROUND';
    outlineNode.strokeJoin = 'ROUND';

    const mainNode = figma.createVector();
    mainNode.vectorPaths = [{ windingRule: 'NONZERO', data: pathData }];
    mainNode.strokes = [{ type: 'SOLID', color }];
    mainNode.strokeWeight = 2;
    mainNode.strokeCap = 'ROUND';
    mainNode.strokeJoin = 'ROUND';

    return { outline: outlineNode, main: mainNode };
  }

  public async moveSegmentsToBack(): Promise<void> {
    if (!this.model) return;
    const state = this.model.getState();
    for (const line of state.lines.values()) {
      if (line.figmaGroupId) {
        try {
          const lineGroup = await figma.getNodeByIdAsync(line.figmaGroupId);
          if (lineGroup && !lineGroup.removed) {
            const parent = lineGroup.parent;
            if (parent && 'insertChild' in parent) {
              parent.insertChild(0, lineGroup as SceneNode);
            }
          }
        } catch {}
      }
    }
  }

  public async clearAllSegments(): Promise<void> {
    if (!this.model) return;
    const state = this.model.getState();
    for (const line of state.lines.values()) {
      if (line.figmaGroupId) {
        try {
          const node = await figma.getNodeByIdAsync(line.figmaGroupId);
          if (node && !node.removed) node.remove();
        } catch { /* node may have been deleted */ }
      }
    }
  }
}
