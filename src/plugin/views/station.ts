import { Line, MapState, Road, Station } from "../models/structures";
import { Model } from "../models";
import { renderStation, renderStationLine } from "../figmls";
import { ErrorChain } from "../error";
import { HVAlign, LineId, StationId } from "../../common/types";
import { getStationAnchorPoint } from "../utils/anchor";

export interface ConnectionPoints {
  head: Vector;
  tail: Vector;
  alignStart: Vector;
  alignEnd: Vector;
}

/**
 * Evaluates a cubic bezier curve at parameter t (0..1).
 * P0 = start, P1 = start control, P2 = end control, P3 = end.
 */
function evalCubicBezier(p0: Vector, p1: Vector, p2: Vector, p3: Vector, t: number): Vector {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}

function computeRoadBezier(road: Road, state: Readonly<MapState>): { p0: Vector; p1: Vector; p2: Vector; p3: Vector } | null {
  const startNode = state.nodes.get(road.startNodeId);
  const endNode = state.nodes.get(road.endNodeId);
  if (!startNode || !endNode) return null;

  const conn0 = road.endpoints[0];
  const conn1 = road.endpoints[1];

  const p0 = startNode.pos;
  const p1 = { x: p0.x + conn0.bezierDisplacement.x, y: p0.y + conn0.bezierDisplacement.y };
  const p3 = endNode.pos;
  const p2 = { x: p3.x + conn1.bezierDisplacement.x, y: p3.y + conn1.bezierDisplacement.y };

  return { p0, p1, p2, p3 };
}

function computeStationPosition(station: Station, state: Readonly<MapState>): Vector {
  if (!station.roadSectionId) return { x: 0, y: 0 };

  for (const road of state.roads.values()) {
    if (road.sections.has(station.roadSectionId)) {
      const bezier = computeRoadBezier(road, state);
      if (!bezier) return { x: 0, y: 0 };

      const t = station.interpT;
      return evalCubicBezier(bezier.p0, bezier.p1, bezier.p2, bezier.p3, t);
    }
  }

  return { x: 0, y: 0 };
}

export class StationRenderer {
  private figmaStationMap: Map<StationId, SceneNode> = new Map();
  private lineConnectionPoints: Map<string, ConnectionPoints> = new Map();
  private model?: Model;

  public setModel(model: Model): void {
    this.model = model;
  }

  public async renderStation(station: Station, state: Readonly<MapState>): Promise<void> {
    let frame: FrameNode | null = null;
    if (station.figmaNodeId) {
      try { frame = await figma.getNodeByIdAsync(station.figmaNodeId) as FrameNode | null; }
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
    const anchor = getStationAnchorPoint(station.textAlign);
    frame.x = position.x - frame.width * anchor.x;
    frame.y = position.y - frame.height * anchor.y;

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
        return { rotation: 0, stopLineFacing: 'left', textLocation: 'right', reverseOrder: false };
      case 'left':
        return { rotation: 0, stopLineFacing: 'right', textLocation: 'left', reverseOrder: false };
      case 'bottom':
        return { rotation: 90, stopLineFacing: 'left', textLocation: 'bottom', reverseOrder: false };
      case 'top':
        return { rotation: 90, stopLineFacing: 'right', textLocation: 'top', reverseOrder: false };
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

      const centerLeft = this.applyTransform(transform, { x: 0, y: height / 2 });
      const centerRight = this.applyTransform(transform, { x: width, y: height / 2 });

      let head: Vector, tail: Vector, alignStart: Vector, alignEnd: Vector;
      switch (station.textAlign) {
        case 'right':
        case 'top':
          head = centerLeft;
          tail = alignEnd = this.applyTransform(transform, { x: maxWidth, y: height / 2 });
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
