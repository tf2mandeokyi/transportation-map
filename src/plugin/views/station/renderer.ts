import { Line } from "../../models/structures/line";
import { Station } from "../../models/structures/station";
import { MapState } from "../../models/structures";
import { renderStation, renderStationLine } from "../../figmls";
import { computeStationPosition, computeStationTangentAngle } from "./position";
import { getLinesForStation } from "./layout";
import { getLinesForSection } from "../../utils/section";
import { LINE_SPACING } from "../../utils/constants";
import { RenderResult } from "../../figml-parser/result";

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

  const section = station.roadSection;
  const noRefCount = section ? getLinesForSection(section, state).length : 0;

  const lines = getLinesForStation(station, state);
  const effectiveNoRef = Math.max(noRefCount, lines.length);

  const indicators = lines.map(({ line, segmentIndex, facing, passThrough }) => ({
    line,
    segmentIndex,
    passThrough,
    result: renderStationLine({
      text: line.name,
      color: line.color,
      stops: !passThrough,
      visible: true,
      facing: station.flipped ? flipLR(facing) : facing,
    }),
  }));

  type SlotItem = { kind: 'indicator'; idx: number } | { kind: 'spacer'; height: number };
  const items: SlotItem[] = indicators.map((_, idx) => ({ kind: 'indicator' as const, idx }));
  const trailing = effectiveNoRef - lines.length;
  if (trailing > 0) items.push({ kind: 'spacer', height: trailing * LINE_SPACING });

  const orderedItems = station.flipped ? [...items].reverse() : items;

  const stationChildren: RenderResult[] = orderedItems.map(item => {
    if (item.kind === 'spacer') {
      const spacerFrame = figma.createFrame();
      spacerFrame.resize(7, item.height);
      spacerFrame.fills = [];
      spacerFrame.layoutMode = 'NONE';
      return RenderResult.newNode(spacerFrame, () => {}, () => {});
    }
    return indicators[item.idx].result;
  });

  const forwardFacing: 'left' | 'right' =
    (station.textAlign === 'right' || station.textAlign === 'bottom') ? 'left' : 'right';
  const textFrameAlignV = station.textAlign === 'top' ? 'bottom' : station.textAlign === 'bottom' ? 'top' : 'center';
  const stationElement = await renderStation({
    text: station.name,
    visible: true,
    rotation: 0,
    textRotation: station.textRotation + tangentAngle + (station.flipped ? 180 : 0),
    children: stationChildren,
    align: `${forwardFacing},center` as const,
    textHAlign: `${station.textHAlign},center` as const,
    textFrameAlign: `${station.textHAlign},${textFrameAlignV}` as const,
    textLocation: station.textAlign,
  }).intoNode();

  parentFrame.appendChild(stationElement);
  return indicators.map(({ line, segmentIndex, passThrough, result }) => ({
    line, segmentIndex, passThrough, node: result.node,
  }));
}

export class StationRenderer {
  private readonly lineConnectionPoints: Map<string, Vector> = new Map();

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
      figma.currentPage.appendChild(frame);
      station.figmaNodeId = frame.id;
    }

    frame.fills = [];
    frame.clipsContent = false;
    frame.children.forEach(child => child.remove());

    const position    = computeStationPosition(station, state);
    const tangentAngle = computeStationTangentAngle(station);
    const children = await renderStationWithTemplate(frame, station, state, tangentAngle);

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
    for (const { line, node, segmentIndex } of lines) {
      const transform = node.absoluteTransform;
      const width  = node.width;
      const height = node.height;

      const center = applyTransform(transform, { x: width / 2, y: height / 2 });
      this.lineConnectionPoints.set(`${station.id}-${line.id}-${segmentIndex}`, center);
    }
  }

  public getConnectionPoint(station: Station, line: Line, segmentIndex: number): Vector | undefined {
    return this.lineConnectionPoints.get(`${station.id}-${line.id}-${segmentIndex}`);
  }

  public clearConnectionPoints(): void {
    this.lineConnectionPoints.clear();
  }
}
