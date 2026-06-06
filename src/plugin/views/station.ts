import { Line, MapState, Road, Station } from "../models/structures";
import { Model } from "../models";
import { renderStation, renderStationLine } from "../figmls";
import { ErrorChain } from "../error";
import { HVAlign, LineId, RoadSectionId, StationId } from "@/common/types";
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

  const p0 = road.endpoints[0].endpointPos;
  const p1 = road.endpoints[0].bezierPos;
  const p3 = road.endpoints[1].endpointPos;
  const p2 = road.endpoints[1].bezierPos;

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

  return offset === 0 ? base : offsetBezier(base, offset);
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

  return evalCubicBezier(bezier, station.interpT);
}

function computeStationTangentAngle(station: Station, state: Readonly<MapState>): number {
  if (!station.roadSectionId) return 0;
  const road = findRoadForSection(station.roadSectionId, state);
  if (!road) return 0;

  const bezier = computeSectionBezier(road, station.roadSectionId, state);
  if (!bezier) return 0;

  const tangent = evalCubicBezierTangent(bezier, station.interpT);
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

    const position = computeStationPosition(station, state);
    const tangentAngle = computeStationTangentAngle(station, state);

    const children = await this.renderStationWithTemplate(frame, station, state, tangentAngle);

    // Figma's rotation is CCW on screen; atan2 gives a CW angle, so negate.
    frame.rotation = -tangentAngle;

    // Position the frame so the anchor point in frame-local space lands at `position` in canvas.
    // Figma rotates CCW by α = -tangentAngle, which equals CW by tangentAngle (θ).
    // For CW rotation θ, a local offset (dax, day) from center maps to canvas offset:
    //   rdax = dax*cos(θ) - day*sin(θ)
    //   rday = dax*sin(θ) + day*cos(θ)
    const w = frame.width;
    const h = frame.height;
    frame.x = position.x - w / 2;
    frame.y = position.y - h / 2;

    const maxWidth = children.reduce((max, c) => Math.max(max, c.node.width), 0);
    this.storeLineConnectionPoints(station, children, maxWidth);
  }

  private async renderStationWithTemplate(
    parentFrame: FrameNode,
    station: Station,
    state: Readonly<MapState>,
    tangentAngle: number,
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
      textRotation: station.textRotation + tangentAngle,
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
        return { rotation: 0, stopLineFacing: 'left',  textLocation: 'right',  reverseOrder: false };
      case 'left':
        return { rotation: 0, stopLineFacing: 'right', textLocation: 'left',   reverseOrder: false };
      case 'bottom':
        return { rotation: 0, stopLineFacing: 'left',  textLocation: 'bottom', reverseOrder: false };
      case 'top':
        return { rotation: 0, stopLineFacing: 'right', textLocation: 'top',    reverseOrder: false };
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
