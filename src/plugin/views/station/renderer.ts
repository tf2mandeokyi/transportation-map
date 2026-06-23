import { Line, MapState, Station } from "../../models/structures";
import { Model } from "../../models";
import { renderStation, renderStationLine } from "../../figmls";
import { LineId, StationId } from "@/common/types";
import { computeStationPosition, computeStationTangentAngle } from "./position";
import { getLinesForStation } from "./layout";
import { getLinesForSection, findRoadForSection } from "../../utils/section";
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
): Promise<{ line: Line; segmentIndex: number; node: SceneNode; passThrough: boolean; departureRole: boolean }[]> {
  const flipLR = (f: 'left' | 'right'): 'left' | 'right' => f === 'left' ? 'right' : 'left';

  // Total directed runs on the section determines the lane band width.
  // Using this as effectiveCount keeps each line at a fixed lateral position
  // regardless of how many lines visit any particular station.
  const road = station.roadSectionId ? findRoadForSection(station.roadSectionId, state) : null;
  const section = road && station.roadSectionId ? road.sections.get(station.roadSectionId) : null;
  const noRefCount = section ? getLinesForSection(section, state).length : 0;

  const lines = getLinesForStation(station, state);
  // effectiveNoRef: reserve at least as many slots as visiting lines
  const effectiveNoRef = Math.max(noRefCount, lines.length);

  // Render each visiting line's indicator (in rank-sorted order, facing flipped for flipped stations).
  const indicators = lines.map(({ line, segmentIndex, facing, passThrough, departureRole }) => ({
    line,
    segmentIndex,
    passThrough,
    departureRole,
    result: renderStationLine({
      text: line.name,
      color: line.color,
      stops: !passThrough,
      visible: true,
      facing: station.flipped ? flipLR(facing) : facing,
    }),
  }));

  // Build slot items: indicators occupy slots 0..lines.length-1, with a trailing
  // invisible spacer for the remaining empty slots so each indicator sits at the
  // correct absolute lane offset for the full section band.
  type SlotItem = { kind: 'indicator'; idx: number } | { kind: 'spacer'; height: number };
  const items: SlotItem[] = indicators.map((_, idx) => ({ kind: 'indicator' as const, idx }));
  const trailing = effectiveNoRef - lines.length;
  if (trailing > 0) items.push({ kind: 'spacer', height: trailing * LINE_SPACING });

  // Flipped stations are rotated 180°, so reverse the slot order to keep
  // each indicator at the same physical lane position after rotation.
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
  return indicators.map(({ line, segmentIndex, passThrough, departureRole, result }) => ({
    line, segmentIndex, passThrough, departureRole, node: result.node,
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
    lines: Array<{ line: Line; segmentIndex: number; node: SceneNode; passThrough: boolean; departureRole: boolean }>,
  ): void {
    for (const { line, node, segmentIndex, departureRole } of lines) {
      const transform = node.absoluteTransform;
      const width  = node.width;
      const height = node.height;

      const center = applyTransform(transform, { x: width / 2, y: height / 2 });
      const key = departureRole
        ? `${station.id}-${line.id}-${segmentIndex}:dep`
        : `${station.id}-${line.id}-${segmentIndex}`;
      this.lineConnectionPoints.set(key, center);
    }
  }

  public getConnectionPoint(stationId: StationId, lineId: LineId, segmentIndex: number, isUturnDeparture?: boolean): Vector | undefined {
    const key = isUturnDeparture
      ? `${stationId}-${lineId}-${segmentIndex}:dep`
      : `${stationId}-${lineId}-${segmentIndex}`;
    return this.lineConnectionPoints.get(key);
  }

  public clearConnectionPoints(): void {
    this.lineConnectionPoints.clear();
  }
}
