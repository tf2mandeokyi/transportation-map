import { Line, MapState, Station } from "../../models/structures";
import { Model } from "../../models";
import { renderStation, renderStationLine } from "../../figmls";
import { LineId, StationId } from "@/common/types";
import { computeStationPosition, computeStationTangentAngle } from "./position";
import { getLinesForStation } from "./layout";

export interface ConnectionPoints {
  head: Vector;
  tail: Vector;
}

function applyTransform(transform: Transform, point: Vector): Vector {
  return {
    x: transform[0][0] * point.x + transform[0][1] * point.y + transform[0][2],
    y: transform[1][0] * point.x + transform[1][1] * point.y + transform[1][2],
  };
}

async function renderStationWithTemplate(
  parentFrame: FrameNode,
  station: Station,
  state: Readonly<MapState>,
  tangentAngle: number,
): Promise<{ line: Line; segmentIndex: number; node: SceneNode; passThrough: boolean }[]> {
  const lines = getLinesForStation(station, state);
  const children = lines.map(({ line, segmentIndex, facing, passThrough }) => ({
    line,
    segmentIndex,
    passThrough,
    result: renderStationLine({ text: line.name, color: line.color, stops: !passThrough, visible: true, facing }),
  }));

  const forwardFacing: 'left' | 'right' =
    (station.textAlign === 'right' || station.textAlign === 'bottom') ? 'left' : 'right';
  const textFrameAlignV = station.textAlign === 'top' ? 'bottom' : station.textAlign === 'bottom' ? 'top' : 'center';
  const stationElement = await renderStation({
    text: station.name,
    visible: true,
    rotation: 0,
    textRotation: station.textRotation + tangentAngle,
    children: children.map(c => c.result),
    align: `${forwardFacing},center` as const,
    textHAlign: `${station.textHAlign},center` as const,
    textFrameAlign: `${station.textHAlign},${textFrameAlignV}` as const,
    textLocation: station.textAlign,
  }).intoNode();

  parentFrame.appendChild(stationElement);
  return children.map(({ line, segmentIndex, passThrough, result }) => ({
    line, segmentIndex, passThrough, node: result.node,
  }));
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
      catch { /* node may have been deleted */ }
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

    const position    = computeStationPosition(station, state);
    const tangentAngle = computeStationTangentAngle(station, state);
    const children = await renderStationWithTemplate(frame, station, state, tangentAngle);

    // Figma's rotation is CCW on screen; atan2 gives a CW angle, so negate.
    // Center = R(θ) * [w/2, h/2]^T + [tx, ty], where R(-θ) is Figma's CCW rotation.
    const w = frame.width;
    const h = frame.height;
    frame.rotation = -tangentAngle;
    const θRad = tangentAngle * Math.PI / 180;
    frame.x = position.x - Math.cos(θRad) * w / 2 + Math.sin(θRad) * h / 2;
    frame.y = position.y - Math.sin(θRad) * w / 2 - Math.cos(θRad) * h / 2;

    const maxWidth = children.reduce((max, c) => Math.max(max, c.node.width), 0);
    this.storeLineConnectionPoints(station, children, maxWidth);
  }

  private storeLineConnectionPoints(
    station: Station,
    lines: Array<{ line: Line; segmentIndex: number; node: SceneNode; passThrough: boolean }>,
    maxWidth: number
  ): void {
    for (const { line, node, segmentIndex, passThrough } of lines) {
      if (passThrough) continue;
      const transform = node.absoluteTransform;
      const width  = node.width;
      const height = node.height;

      const centerLeft  = applyTransform(transform, { x: 0,     y: height / 2 });
      const centerRight = applyTransform(transform, { x: width, y: height / 2 });

      let head: Vector, tail: Vector;
      switch (station.textAlign) {
        case 'right':
        case 'top':
          head = centerLeft;
          tail = applyTransform(transform, { x: maxWidth,          y: height / 2 });
          break;
        case 'left':
        case 'bottom':
          head = centerRight;
          tail = applyTransform(transform, { x: width - maxWidth, y: height / 2 });
          break;
      }

      this.lineConnectionPoints.set(`${station.id}-${line.id}-${segmentIndex}`, { head, tail });
    }
  }

  public getConnectionPoint(stationId: StationId, lineId: LineId, segmentIndex: number): ConnectionPoints | undefined {
    return this.lineConnectionPoints.get(`${stationId}-${lineId}-${segmentIndex}`);
  }

  public clearConnectionPoints(): void {
    this.lineConnectionPoints.clear();
  }
}
