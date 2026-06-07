import { Line, MapState, Road, Station } from "../models/structures";
import { Model } from "../models";
import { renderStation, renderStationLine } from "../figmls";
import { HVAlign, LineId, RoadSectionId, StationId } from "@/common/types";
import { getLineDirectionAtStop } from "../utils/section";
import {
  evalQuadraticBezier,
  evalQuadraticBezierTangent,
  TRACK_SPACING,
  QuadBezierPoints,
} from "../utils/bezier";

export interface ConnectionPoints {
  head: Vector;
  tail: Vector;
}

function computeRoadBezier(road: Road, state: Readonly<MapState>): QuadBezierPoints | null {
  const startNode = state.nodes.get(road.startNodeId);
  const endNode = state.nodes.get(road.endNodeId);
  if (!startNode || !endNode) return null;

  const p0 = road.endpoints[0].endpointPos;
  const p1 = road.bezierMidPoint;
  const p2 = road.endpoints[1].endpointPos;

  return { p0, p1, p2 };
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

  const base = computeRoadBezier(road, state);
  if (!base) return { x: 0, y: 0 };

  const section = road.sections.get(station.roadSectionId);
  if (!section) return { x: 0, y: 0 };

  const sections = Array.from(road.sections.values());
  const center = (sections.length - 1) / 2;
  const offset = (section.index - center) * TRACK_SPACING;

  const pos = evalQuadraticBezier(base, station.interpT);
  if (offset === 0) return pos;

  const tangent = evalQuadraticBezierTangent(base, station.interpT);
  const len = Math.hypot(tangent.x, tangent.y);
  if (len < 0.001) return pos;
  return { x: pos.x + (-tangent.y / len) * offset, y: pos.y + (tangent.x / len) * offset };
}

function computeStationTangentAngle(station: Station, state: Readonly<MapState>): number {
  if (!station.roadSectionId) return 0;
  const road = findRoadForSection(station.roadSectionId, state);
  if (!road) return 0;

  const base = computeRoadBezier(road, state);
  if (!base) return 0;

  const tangent = evalQuadraticBezierTangent(base, station.interpT);
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

    // Read intrinsic dimensions before rotation (rotation doesn't change them, but
    // this makes intent clear).
    const w = frame.width;
    const h = frame.height;

    // Figma's rotation is CCW on screen; atan2 gives a CW angle, so negate.
    // frame.x/y = relativeTransform translation. Setting rotation rotates around
    // the top-left corner (x/y stays fixed), so we must solve for the tx/ty that
    // places the rotated frame's center at `position`.
    // Center = R(θ) * [w/2, h/2]^T + [tx, ty], where R(-θ) is Figma's CCW rotation.
    frame.rotation = -tangentAngle;
    const θRad = tangentAngle * Math.PI / 180;
    frame.x = position.x - Math.cos(θRad) * w / 2 + Math.sin(θRad) * h / 2;
    frame.y = position.y - Math.sin(θRad) * w / 2 - Math.cos(θRad) * h / 2;

    const maxWidth = children.reduce((max, c) => Math.max(max, c.node.width), 0);
    this.storeLineConnectionPoints(station, children, maxWidth);
  }

  private async renderStationWithTemplate(
    parentFrame: FrameNode,
    station: Station,
    state: Readonly<MapState>,
    tangentAngle: number,
  ): Promise<{ line: Line; segmentIndex: number; node: SceneNode }[]> {
    const { rotation, textLocation, reverseOrder } = this.getLayoutParams(station.textAlign);

    const lines = this.getLinesForStation(station, state);
    const children = lines.map(({ line, segmentIndex, facing }) => {
      const result = renderStationLine({
        text: line.name,
        color: line.color,
        stops: true,
        visible: true,
        facing
      });
      return { line, segmentIndex, result };
    });

    if (reverseOrder) children.reverse();

    const forwardFacing: 'left' | 'right' =
      (station.textAlign === 'right' || station.textAlign === 'bottom') ? 'left' : 'right';
    const align = `${forwardFacing},center` as const;
    const stationElement = await renderStation({
      text: station.name,
      visible: true,
      rotation,
      textRotation: station.textRotation + tangentAngle,
      children: children.map(c => c.result),
      align,
      textLocation
    }).intoNode();

    parentFrame.appendChild(stationElement);
    return children.map(({ line, segmentIndex, result }) => ({ line, segmentIndex, node: result.node }));
  }

  private getLayoutParams(textAlign: HVAlign): {
    rotation: number;
    textLocation: 'left' | 'right' | 'top' | 'bottom';
    reverseOrder: boolean;
  } {
    switch (textAlign) {
      case 'right':  return { rotation: 0, textLocation: 'right',  reverseOrder: false };
      case 'left':   return { rotation: 0, textLocation: 'left',   reverseOrder: false };
      case 'bottom': return { rotation: 0, textLocation: 'bottom', reverseOrder: false };
      case 'top':    return { rotation: 0, textLocation: 'top',    reverseOrder: false };
    }
  }

  private getLinesForStation(
    station: Station, state: Readonly<MapState>
  ): Array<{ line: Line; segmentIndex: number; facing: 'left' | 'right' }> {
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
      const lineA = state.lines.get(a.lineId)!;
      const lineB = state.lines.get(b.lineId)!;
      const dirA = getLineDirectionAtStop(lineA, a.segmentIndex, state);
      const dirB = getLineDirectionAtStop(lineB, b.segmentIndex, state);
      if (dirA !== dirB) return dirA === 'forward' ? -1 : 1;
      const oa = globalOrder.indexOf(a.lineId);
      const ob = globalOrder.indexOf(b.lineId);
      if (oa !== ob) return oa - ob;
      return a.segmentIndex - b.segmentIndex;
    });

    return result.map(({ lineId, segmentIndex }) => {
      const line = state.lines.get(lineId)!;
      if (!line) return null;
      const dir = getLineDirectionAtStop(line, segmentIndex, state);
      const facing: 'left' | 'right' = dir === 'forward' ? 'right' : 'left';
      return { line, segmentIndex, facing };
    }).filter((item): item is { line: Line; segmentIndex: number; facing: 'left' | 'right' } => item !== null);
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

      let head: Vector, tail: Vector;
      switch (station.textAlign) {
        case 'right':
        case 'top':
          head = centerLeft;
          tail = this.applyTransform(transform, { x: maxWidth,          y: height / 2 });
          break;
        case 'left':
        case 'bottom':
          head = centerRight;
          tail = this.applyTransform(transform, { x: width - maxWidth, y: height / 2 });
          break;
      }

      const key = `${station.id}-${line.id}-${segmentIndex}`;
      this.lineConnectionPoints.set(key, { head, tail });
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
