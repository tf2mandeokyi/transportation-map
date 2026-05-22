import { Line, MapState, Road, Station } from "../models/structures";
import { Model } from "../models";
import { StationRenderer } from "./station";
import { NodeId, RoadSectionId } from "@/common/types";
import {
  offsetBezierAdaptive,
  subBezier,
  TRACK_SPACING,
  BezierPoints,
} from "../utils/bezier";
import { JunctionShape } from "../utils/junction-shape";
import { PathBuilder } from "../utils/path";
import { getLinesForSection, lineOffsetInSection } from "../utils/section";
import { hexToRgb } from "@/common/utils/color";

interface BezierSegment {
  outline: VectorNode;
  main: VectorNode;
}

function computeRoadBezier(road: Road, state: Readonly<MapState>): BezierPoints | null {
  const startNode = state.nodes.get(road.startNodeId);
  const endNode = state.nodes.get(road.endNodeId);
  if (!startNode || !endNode) return null;

  const p0 = { x: startNode.pos.x + road.endpoints[0].endpointDisplacement.x, y: startNode.pos.y + road.endpoints[0].endpointDisplacement.y };
  const p1 = { x: p0.x + road.endpoints[0].bezierDisplacement.x, y: p0.y + road.endpoints[0].bezierDisplacement.y };
  const p3 = { x: endNode.pos.x + road.endpoints[1].endpointDisplacement.x, y: endNode.pos.y + road.endpoints[1].endpointDisplacement.y };
  const p2 = { x: p3.x + road.endpoints[1].bezierDisplacement.x, y: p3.y + road.endpoints[1].bezierDisplacement.y };

  return { p0, p1, p2, p3 };
}

function findRoadForSection(sectionId: RoadSectionId, state: Readonly<MapState>): Road | null {
  for (const road of state.roads.values()) {
    if (road.sections.has(sectionId)) return road;
  }
  return null;
}

// Returns the node shared between two adjacent roads, or null if not adjacent.
function findSharedNode(roadA: Road, roadB: Road): NodeId | null {
  if (roadA.endNodeId === roadB.startNodeId || roadA.endNodeId === roadB.endNodeId) return roadA.endNodeId;
  if (roadA.startNodeId === roadB.startNodeId || roadA.startNodeId === roadB.endNodeId) return roadA.startNodeId;
  return null;
}

// Total lateral offset from the road centerline for this line on this section:
// section-track offset + per-line offset within the section band.
// If the line has no stations on the section it is placed at the outermost slot.
function computeTotalOffset(line: Line, road: Road, sectionId: RoadSectionId, state: Readonly<MapState>): number {
  const section = road.sections.get(sectionId);
  if (!section) return 0;

  const sections = Array.from(road.sections.values());
  const center = (sections.length - 1) / 2;
  const sectionOffset = (section.index - center) * TRACK_SPACING;

  const lines = getLinesForSection(section, state);
  const lineIndex = lines.findIndex(l => l.id === line.id);
  const effectiveIdx   = lineIndex >= 0 ? lineIndex   : lines.length;
  const effectiveCount = lineIndex >= 0 ? lines.length : lines.length + 1;
  const lineOffset = lineOffsetInSection(effectiveIdx, Math.max(effectiveCount, 1));

  return sectionOffset + lineOffset;
}

// Returns the offset bezier segments for one road-section sub-range.
function computeSectionSegs(
  line: Line, road: Road, sectionId: RoadSectionId,
  t1: number, t2: number,
  state: Readonly<MapState>,
): BezierPoints[] {
  const centerline = computeRoadBezier(road, state);
  if (!centerline) return [];

  const sub = subBezier(centerline, t1, t2);
  const totalOffset = computeTotalOffset(line, road, sectionId, state);
  return totalOffset === 0 ? [sub] : offsetBezierAdaptive(sub, totalOffset);
}

function appendJunctionCurve(pb: PathBuilder, prev: BezierPoints, next: BezierPoints): void {
  const exitLen = Math.hypot(prev.p3.x - prev.p2.x, prev.p3.y - prev.p2.y);
  const exitDir: Vector = exitLen < 0.001
    ? { x: 1, y: 0 }
    : { x: (prev.p3.x - prev.p2.x) / exitLen, y: (prev.p3.y - prev.p2.y) / exitLen };

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
    // to follow the correct road sections.
    type StopInfo = { pathIdx: number; station: Station };
    const stops: StopInfo[] = [];
    const rsesBefore: RoadSectionId[][] = []; // rsesBefore[i] = RSEs collected before stops[i]
    let pendingRSEs: RoadSectionId[] = [];

    for (const p of line.paths) {
      if (p.kind === 'road-section-enter') {
        pendingRSEs.push(p.roadSectionId);
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
      // RSEs that appeared between these two station stops.
      const rseBetween = rsesBefore[si + 1];

      const outlineNodes: VectorNode[] = [];
      const mainNodes: VectorNode[] = [];

      const segment = this.renderLineSegment(
        line, startPathIdx, endPathIdx,
        startStation, endStation, rseBetween, color, state
      );
      if (segment) {
        outlineNodes.push(segment.outline);
        mainNodes.push(segment.main);
      }

      const middleSegment = this.renderMiddleSegment(line, endPathIdx, endStation, color);
      if (middleSegment) {
        outlineNodes.push(middleSegment.outline);
        mainNodes.push(middleSegment.main);
      }

      if (outlineNodes.length > 0) {
        segmentNodes.push(
          figma.group(outlineNodes, figma.currentPage),
          figma.group(mainNodes, figma.currentPage)
        );
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
      } catch {}
    }
  }

  private renderLineSegment(
    line: Line,
    startPathIdx: number,
    endPathIdx: number,
    startStation: Station,
    endStation: Station,
    rseBetween: RoadSectionId[],
    color: RGB,
    state: Readonly<MapState>
  ): BezierSegment | null {
    const startPoints = this.stationRenderer.getConnectionPoint(startStation.id, line.id, startPathIdx);
    const endPoints   = this.stationRenderer.getConnectionPoint(endStation.id,   line.id, endPathIdx);

    if (!startPoints || !endPoints) {
      console.warn(`Missing connection points for line ${line.id}`);
      return null;
    }

    const pathData = this.buildSegmentPath(
      line, startStation, endStation, rseBetween,
      startPoints.head, endPoints.tail, state
    );
    return this.bezierPathToSegments(pathData, color);
  }

  private buildSegmentPath(
    line: Line,
    startStation: Station,
    endStation: Station,
    rseBetween: RoadSectionId[],
    headCanvas: Vector,
    tailCanvas: Vector,
    state: Readonly<MapState>
  ): string {
    const startSectionId = startStation.roadSectionId;
    const endSectionId = endStation.roadSectionId;

    if (!startSectionId || !endSectionId) {
      return `M ${headCanvas.x} ${headCanvas.y} L ${tailCanvas.x} ${tailCanvas.y}`;
    }

    // Build the ordered sequence of sections this segment traverses.
    // Starts at the start station's section, goes through any intermediate RSE sections,
    // and ends at the end station's section.
    const sectionSeq: RoadSectionId[] = [startSectionId];
    for (const rsId of rseBetween) {
      if (sectionSeq[sectionSeq.length - 1] !== rsId) sectionSeq.push(rsId);
    }
    if (sectionSeq[sectionSeq.length - 1] !== endSectionId) sectionSeq.push(endSectionId);

    const fallback = new PathBuilder().moveTo(headCanvas).lineTo(tailCanvas).build();

    // Single-section: sub-bezier of the centerline, then adaptive offset.
    if (sectionSeq.length === 1) {
      const road = findRoadForSection(startSectionId, state);
      if (!road) return fallback;
      const segs = computeSectionSegs(line, road, startSectionId, startStation.interpT, endStation.interpT, state);
      if (segs.length === 0) return fallback;
      return new PathBuilder().beziers(segs).build();
    }

    // Multi-section: collect offset segments per section, then chain with smooth junction curves.
    const entries: BezierPoints[][] = [];

    for (let i = 0; i < sectionSeq.length; i++) {
      const sectionId = sectionSeq[i];
      const road = findRoadForSection(sectionId, state);
      if (!road) continue;

      let entryT: number;
      if (i === 0) {
        entryT = startStation.interpT;
      } else {
        const prevRoad = findRoadForSection(sectionSeq[i - 1], state);
        if (!prevRoad) continue;
        const sharedNode = findSharedNode(prevRoad, road);
        if (sharedNode === null) continue;
        entryT = sharedNode === road.startNodeId ? 0 : 1;
      }

      let exitT: number;
      if (i === sectionSeq.length - 1) {
        exitT = endStation.interpT;
      } else {
        const nextRoad = findRoadForSection(sectionSeq[i + 1], state);
        if (!nextRoad) continue;
        const sharedNode = findSharedNode(road, nextRoad);
        if (sharedNode === null) continue;
        exitT = sharedNode === road.endNodeId ? 1 : 0;
      }

      const segs = computeSectionSegs(line, road, sectionId, entryT, exitT, state);
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

  private renderMiddleSegment(line: Line, segmentIndex: number, station: Station, color: RGB): BezierSegment | null {
    const points = this.stationRenderer.getConnectionPoint(station.id, line.id, segmentIndex);
    if (!points) return null;

    const pathData = `M ${points.alignStart.x} ${points.alignStart.y} L ${points.alignEnd.x} ${points.alignEnd.y}`;
    return this.bezierPathToSegments(pathData, color);
  }

  private bezierPathToSegments(pathData: string, color: RGB): BezierSegment | null {
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
        } catch {}
      }
    }
  }
}
