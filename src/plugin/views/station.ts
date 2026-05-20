import { Line, MapState, Road, Station } from "../models/structures";
import { Model } from "../models";
import { renderStation, renderStationLine } from "../figmls";
import { ErrorChain } from "../error";
import { HVAlign, LineId, RoadSectionId, StationId } from "@/common/types";
import { getStationAnchorPoint } from "../utils/anchor";
import {
  evalCubicBezier,
  evalCubicBezierTangent,
  offsetBezier,
  TRACK_SPACING,
  BezierPoints,
} from "../utils/bezier";

export interface ConnectionPoints {
  head: Vector;
  tail: Vector;
  alignStart: Vector;
  alignEnd: Vector;
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

function computeStationPosition(station: Station, state: Readonly<MapState>): Vector {
  if (!station.roadSectionId) return { x: 0, y: 0 };
  const road = findRoadForSection(station.roadSectionId, state);
  if (!road) return { x: 0, y: 0 };

  const bezier = computeSectionBezier(road, station.roadSectionId, state);
  if (!bezier) return { x: 0, y: 0 };

  return evalCubicBezier(bezier.p0, bezier.p1, bezier.p2, bezier.p3, station.interpT);
}

function computeStationTangentAngle(station: Station, state: Readonly<MapState>): number {
  if (!station.roadSectionId) return 0;
  const road = findRoadForSection(station.roadSectionId, state);
  if (!road) return 0;

  const base = computeRoadBezier(road, state);
  if (!base) return 0;

  const tangent = evalCubicBezierTangent(base.p0, base.p1, base.p2, base.p3, station.interpT);
  return Math.atan2(tangent.y, tangent.x) * 180 / Math.PI;
}

export class StationRenderer {
  private readonly figmaStationMap: Map<StationId, SceneNode> = new Map();
  private readonly lineConnectionPoints: Map<string, ConnectionPoints> = new Map();
  private model?: Model;

  public setModel(model: Model): void {
    this.model = model;
  }

  public async renderStation(station: Station, state: Readonly<MapState>): Promise<void> {
    let frame: FrameNode | null = null;
    if (station.figmaNodeId) {
      try { frame = await figma.getNodeByIdAsync(station.figmaNodeId) as FrameNode; }
      catch {}
    }
    if (!frame) {
      frame = figma.createFrame();
      frame.name = `Stop: ${station.name}`;
      frame.layoutMode = 'HORIZONTAL';
      frame.layoutSizingHorizontal = 'HUG';
      frame.layoutSizingVertical = 'HUG';

      this.figmaStationMap.set(station.id, frame);
      figma.currentPage.appendChild(frame);
      this.model?.updateStationFigmaNodeId(station.id, frame.id);
    }

    frame.fills = [];
    frame.clipsContent = false;
    frame.children.forEach(child => child.remove());

    const children = await this.renderStationWithTemplate(frame, station, state);

    const position = computeStationPosition(station, state);
    const tangentAngle = computeStationTangentAngle(station, state);
    const anchor = getStationAnchorPoint(station.textAlign);

    // // Set rotation before computing position (frame dimensions are already fixed)
    frame.rotation = tangentAngle;

    // Position the frame so the anchor point in frame-local space lands at `position` in canvas.
    // Figma rotates clockwise around the frame center (frame.x + w/2, frame.y + h/2).
    // For CW rotation θ, a local offset (dax, day) from center maps to canvas offset:
    //   rdax = dax*cos(θ) - day*sin(θ)
    //   rday = dax*sin(θ) + day*cos(θ)
    const w = frame.width;
    const h = frame.height;
    const θ = tangentAngle * Math.PI / 180;
    const dax = anchor.x * w - w / 2;
    const day = anchor.y * h - h / 2;
    const rdax = dax * Math.cos(θ) - day * Math.sin(θ);
    const rday = dax * Math.sin(θ) + day * Math.cos(θ);
    frame.x = position.x - rdax - w / 2;
    frame.y = position.y - rday - h / 2;

    const maxWidth = children.reduce((max, c) => Math.max(max, c.node.width), 0);
    this.storeLineConnectionPoints(station, children, maxWidth);
  }

  private async renderStationWithTemplate(
    parentFrame: FrameNode,
    station: Station,
    state: Readonly<MapState>
  ): Promise<{ line: Line; segmentIndex: number; node: SceneNode }[]> {
    const { rotation, stopLineFacing, textLocation, reverseOrder } = this.getLayoutParams(station.textAlign);

    const lines = this.getLinesForStation(station, state);
    const children = await Promise.all(lines.map(async ({ line, segmentIndex }) => {
      const node = await renderStationLine({
          text: line.name,
          color: line.color,
          stops: true,
          visible: true,
          facing: stopLineFacing
        })
        .intoNode()
        .catch(ErrorChain.thrower(`Error rendering line ${line.name} at station ${station.name}`));
      return { line, segmentIndex, node };
    }));

    if (reverseOrder) children.reverse();

    const align = `${stopLineFacing},center` as const;
    const stationElement = await renderStation({
      text: station.name,
      visible: true,
      rotation,
      children: children.map(c => c.node),
      align,
      textLocation
    }).intoNode();

    parentFrame.appendChild(stationElement);
    return children;
  }

  private getLayoutParams(textAlign: HVAlign): {
    rotation: number;
    stopLineFacing: 'left' | 'right';
    textLocation: 'left' | 'right' | 'top' | 'bottom';
    reverseOrder: boolean;
  } {
    switch (textAlign) {
      case 'right':
        return { rotation: 0,  stopLineFacing: 'left',  textLocation: 'right',  reverseOrder: false };
      case 'left':
        return { rotation: 0,  stopLineFacing: 'right', textLocation: 'left',   reverseOrder: false };
      case 'bottom':
        return { rotation: 90, stopLineFacing: 'left',  textLocation: 'bottom', reverseOrder: false };
      case 'top':
        return { rotation: 90, stopLineFacing: 'right', textLocation: 'top',    reverseOrder: false };
    }
  }

  private getLinesForStation(station: Station, state: Readonly<MapState>): Array<{ line: Line; segmentIndex: number }> {
    const result: Array<{ lineId: LineId; segmentIndex: number }> = [];

    for (const line of state.lines.values()) {
      for (let i = 0; i < line.paths.length; i++) {
        const path = line.paths[i];
        if (path.kind === 'station-stop' && path.stationId === station.id) {
          result.push({ lineId: line.id, segmentIndex: i });
        }
      }
    }

    const globalOrder = state.lineStackingOrder;
    result.sort((a, b) => {
      const oa = globalOrder.indexOf(a.lineId);
      const ob = globalOrder.indexOf(b.lineId);
      if (oa !== ob) return oa - ob;
      return a.segmentIndex - b.segmentIndex;
    });

    return result.map(({ lineId, segmentIndex }) => ({
      line: state.lines.get(lineId)!,
      segmentIndex
    })).filter(item => item.line);
  }

  private storeLineConnectionPoints(
    station: Station,
    lines: Array<{ line: Line; segmentIndex: number; node: SceneNode }>,
    maxWidth: number
  ) {
    for (const { line, node, segmentIndex } of lines) {
      const transform = node.absoluteTransform;
      const width = node.width;
      const height = node.height;

      const centerLeft  = this.applyTransform(transform, { x: 0,        y: height / 2 });
      const centerRight = this.applyTransform(transform, { x: width,    y: height / 2 });

      let head: Vector, tail: Vector, alignStart: Vector, alignEnd: Vector;
      switch (station.textAlign) {
        case 'right':
        case 'top':
          head = centerLeft;
          tail = alignEnd = this.applyTransform(transform, { x: maxWidth,          y: height / 2 });
          alignStart = centerRight;
          break;
        case 'left':
        case 'bottom':
          head = centerRight;
          tail = alignStart = this.applyTransform(transform, { x: width - maxWidth, y: height / 2 });
          alignEnd = centerLeft;
          break;
      }

      const key = `${station.id}-${line.id}-${segmentIndex}`;
      this.lineConnectionPoints.set(key, { head, tail, alignStart, alignEnd });
    }
  }

  private applyTransform(transform: Transform, point: Vector): Vector {
    return {
      x: transform[0][0] * point.x + transform[0][1] * point.y + transform[0][2],
      y: transform[1][0] * point.x + transform[1][1] * point.y + transform[1][2]
    };
  }

  public getConnectionPoint(stationId: StationId, lineId: LineId, segmentIndex: number): ConnectionPoints | undefined {
    return this.lineConnectionPoints.get(`${stationId}-${lineId}-${segmentIndex}`);
  }

  public clearConnectionPoints(): void {
    this.lineConnectionPoints.clear();
  }
}
