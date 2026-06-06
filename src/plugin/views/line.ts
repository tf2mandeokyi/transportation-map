import { Line, MapState, Road, RoadSectionEnter, Station } from "../models/structures";
import { Model } from "../models";
import { StationRenderer } from "./station";
import { RoadSectionId } from "@/common/types";
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

  const p0 = road.endpoints[0].endpointPos;
  const p1 = road.endpoints[0].bezierPos;
  const p3 = road.endpoints[1].endpointPos;
  const p2 = road.endpoints[1].bezierPos;

  return { p0, p1, p2, p3 };
}

function findRoadForSection(sectionId: RoadSectionId, state: Readonly<MapState>): Road | null {
  for (const road of state.roads.values()) {
    if (road.sections.has(sectionId)) return road;
  }
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
  // Normalize offset to the road's canonical direction (t=0→1). When traversing
  // in reverse (t1 > t2), subBezier flips the tangent, which would flip the
  // perpendicular normal — negating here keeps all lines offset consistently.
  const directedOffset = t1 > t2 ? -totalOffset : totalOffset;
  return directedOffset === 0 ? [sub] : offsetBezierAdaptive(sub, directedOffset);
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
    rseBetween: RoadSectionEnter[],
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
      const segs = computeSectionSegs(line, startRoad, startSectionId, startStation.interpT, endStation.interpT, state);
      if (segs.length === 0) return fallback;
      return new PathBuilder().beziers(segs).build();
    }

    // Multi-road: collect offset segments per road, chain with smooth junction curves.
    const entries: BezierPoints[][] = [];

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
