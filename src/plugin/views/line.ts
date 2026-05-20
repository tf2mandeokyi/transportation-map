import { Line, MapState, Road, Station } from "../models/structures";
import { Model } from "../models";
import { StationRenderer } from "./station";
import { RoadSectionId } from "@/common/types";
import {
  offsetBezier,
  subBezier,
  bezierPathData,
  TRACK_SPACING,
  BezierPoints,
} from "../utils/bezier";
import { hexToRgb } from "@/common/utils/color";

interface BezierSegment {
  outline: VectorNode;
  main: VectorNode;
}

function computeRoadBezier(road: Road, state: Readonly<MapState>): BezierPoints | null {
  const startNode = state.nodes.get(road.startNodeId);
  const endNode = state.nodes.get(road.endNodeId);
  if (!startNode || !endNode) return null;

  const p0 = startNode.pos;
  const p1 = { x: p0.x + road.endpoints[0].bezierDisplacement.x, y: p0.y + road.endpoints[0].bezierDisplacement.y };
  const p3 = endNode.pos;
  const p2 = { x: p3.x + road.endpoints[1].bezierDisplacement.x, y: p3.y + road.endpoints[1].bezierDisplacement.y };

  return { p0, p1, p2, p3 };
}

function computeSectionBezier(road: Road, sectionId: RoadSectionId, state: Readonly<MapState>): BezierPoints | null {
  const base = computeRoadBezier(road, state);
  if (!base) return null;

  const section = road.sections.get(sectionId);
  if (!section) return null;

  const sections = Array.from(road.sections.values());
  const center = (sections.length - 1) / 2;
  const offset = (section.index - center) * TRACK_SPACING;

  return offset === 0 ? base : offsetBezier(base.p0, base.p1, base.p2, base.p3, offset);
}

function findRoadForSection(sectionId: RoadSectionId, state: Readonly<MapState>): Road | null {
  for (const road of state.roads.values()) {
    if (road.sections.has(sectionId)) return road;
  }
  return null;
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

    for (let i = 0; i < line.paths.length - 1; i++) {
      const current = line.paths[i];
      const next = line.paths[i + 1];

      if (current.kind !== 'station-stop' || next.kind !== 'station-stop') continue;

      const startStation = state.stations.get(current.stationId);
      const endStation = state.stations.get(next.stationId);
      if (!startStation || !endStation) continue;

      const outlineNodes: VectorNode[] = [];
      const mainNodes: VectorNode[] = [];

      const segment = this.renderLineSegment(line, i, startStation, endStation, color, state);
      if (segment) {
        outlineNodes.push(segment.outline);
        mainNodes.push(segment.main);
      }

      const middleSegment = this.renderMiddleSegment(line, i + 1, endStation, color);
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
    segmentIndex: number,
    startStation: Station,
    endStation: Station,
    color: RGB,
    state: Readonly<MapState>
  ): BezierSegment | null {
    const startPoints = this.stationRenderer.getConnectionPoint(startStation.id, line.id, segmentIndex);
    const endPoints   = this.stationRenderer.getConnectionPoint(endStation.id,   line.id, segmentIndex + 1);

    if (!startPoints || !endPoints) {
      console.warn(`Missing connection points for line ${line.id} segment ${segmentIndex}`);
      return null;
    }

    const pathData = this.buildSegmentPath(startStation, endStation, startPoints.head, endPoints.tail, state);
    return this.bezierPathToSegments(pathData, color);
  }

  private buildSegmentPath(
    startStation: Station,
    endStation: Station,
    headCanvas: Vector,
    tailCanvas: Vector,
    state: Readonly<MapState>
  ): string {
    const sId = startStation.roadSectionId;
    const eId = endStation.roadSectionId;

    if (sId && eId && sId === eId) {
      const road = findRoadForSection(sId, state);
      if (road) {
        const sectionBezier = computeSectionBezier(road, sId, state);
        if (sectionBezier) {
          const sub = subBezier(
            sectionBezier.p0, sectionBezier.p1, sectionBezier.p2, sectionBezier.p3,
            startStation.interpT, endStation.interpT
          );
          return bezierPathData(sub);
        }
      }
    }

    // Fallback for cross-section or unlinked stations: straight bezier between connection points
    return `M ${headCanvas.x} ${headCanvas.y} L ${tailCanvas.x} ${tailCanvas.y}`;
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
