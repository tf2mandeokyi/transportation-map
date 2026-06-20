import { Line, MapState, Station } from "../../models/structures";
import { Model } from "../../models";
import { renderStation, renderStationLine } from "../../figmls";
import { LineId, StationId } from "@/common/types";
import { computeStationPosition, computeStationTangentAngle } from "./position";
import { getLinesForStation } from "./layout";

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
  const flipLR = (f: 'left' | 'right'): 'left' | 'right' => f === 'left' ? 'right' : 'left';

  const lines = getLinesForStation(station, state);
  // When flipped, reverse line order and flip each facing so the content stays
  // visually correct after the 180° frame rotation applied in renderStation.
  const orderedLines = station.flipped ? [...lines].reverse() : lines;
  const children = orderedLines.map(({ line, segmentIndex, facing, passThrough }) => ({
    line,
    segmentIndex,
    passThrough,
    result: renderStationLine({ text: line.name, color: line.color, stops: !passThrough, visible: true, facing: station.flipped ? flipLR(facing) : facing }),
  }));

  const forwardFacing: 'left' | 'right' =
    (station.textAlign === 'right' || station.textAlign === 'bottom') ? 'left' : 'right';
  const textFrameAlignV = station.textAlign === 'top' ? 'bottom' : station.textAlign === 'bottom' ? 'top' : 'center';
  const stationElement = await renderStation({
    text: station.name,
    visible: true,
    rotation: 0,
    textRotation: station.textRotation + tangentAngle + (station.flipped ? 180 : 0),
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
  private readonly lineConnectionPoints: Map<string, Vector> = new Map();
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
    // When flipped, add 180° to rotate the entire station frame upside-down.
    const w = frame.width;
    const h = frame.height;
    const effectiveAngle = station.flipped ? tangentAngle + 180 : tangentAngle;
    frame.rotation = -effectiveAngle;
    const θRad = effectiveAngle * Math.PI / 180;
    frame.x = position.x - Math.cos(θRad) * w / 2 + Math.sin(θRad) * h / 2;
    frame.y = position.y - Math.sin(θRad) * w / 2 - Math.cos(θRad) * h / 2;

    this.storeLineConnectionPoints(station, children);
  }

  private storeLineConnectionPoints(
    station: Station,
    lines: Array<{ line: Line; segmentIndex: number; node: SceneNode; passThrough: boolean }>,
  ): void {
    for (const { line, node, segmentIndex, passThrough } of lines) {
      if (passThrough) continue;
      const transform = node.absoluteTransform;
      const width  = node.width;
      const height = node.height;

      const center = applyTransform(transform, { x: width / 2, y: height / 2 });
      this.lineConnectionPoints.set(`${station.id}-${line.id}-${segmentIndex}`, center);
    }
  }

  public getConnectionPoint(stationId: StationId, lineId: LineId, segmentIndex: number): Vector | undefined {
    return this.lineConnectionPoints.get(`${stationId}-${lineId}-${segmentIndex}`);
  }

  public clearConnectionPoints(): void {
    this.lineConnectionPoints.clear();
  }
}
