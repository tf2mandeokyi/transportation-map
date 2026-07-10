import { Line } from "../../models/structures/line";
import { Station } from "../../models/structures/station";
import { MapState, RoadSection } from "../../models/structures";
import { renderStation, renderStationLine } from "../../figmls";
import { computeStationTangentAngle } from "./position";
import { getLinesForStation } from "./layout";
import { LINE_SPACING } from "../../utils/constants";
import { RenderResult } from "@/figml-parser/result";
import { applyTransform } from "../../utils/math";

async function renderStationWithTemplate(
  parentFrame: FrameNode,
  station: Station,
  tangentAngle: number,
): Promise<{ line: Line; passIndex: number; node: SceneNode; passThrough: boolean }[]> {
  const flipLR = (f: 'left' | 'right'): 'left' | 'right' => f === 'left' ? 'right' : 'left';

  const section = station.parentRoadSection as RoadSection | undefined;
  const noRefCount = section?.getMaxStationStopCount() ?? 0;

  const lines = getLinesForStation(station);
  const effectiveNoRef = Math.max(noRefCount, lines.length);

  const indicators = lines.map(({ line, passIndex, facing, passThrough }) => ({
    line,
    passIndex,
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
  const stationElement = await renderStation({
    text: station.name,
    visible: true,
    rotation: 0,
    textRotation: station.textRotation + tangentAngle + (station.flipped ? 180 : 0),
    children: stationChildren,
    align: `${forwardFacing},center` as const,
    textAlign: `${station.textHAlign},center` as const,
    textFrameAlign: `${station.textHAlign},${station.textVAlign}` as const,
    textLocation: station.textAlign,
  }).intoNode();

  parentFrame.appendChild(stationElement);
  return indicators.map(({ line, passIndex, passThrough, result }) => ({
    line, passIndex, passThrough, node: result.node,
  }));
}

export class StationRenderer {
  private readonly lineConnectionPoints: Map<string, Vector> = new Map();

  // Fired every time a station's frame is rendered (both newly created and reused across
  // reloads), so callers can (re)register drag listeners against the current frame id.
  public onRendered?: (station: Station, frame: FrameNode) => void;

  public async renderStation(station: Station): Promise<void> {
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

    const position    = station.computePosition();
    const tangentAngle = computeStationTangentAngle(station);
    const children = await renderStationWithTemplate(frame, station, tangentAngle);

    const w = frame.width;
    const h = frame.height;
    const effectiveAngle = station.flipped ? tangentAngle + 180 : tangentAngle;
    frame.rotation = -effectiveAngle;
    const θRad = effectiveAngle * Math.PI / 180;
    frame.x = position.x - Math.cos(θRad) * w / 2 + Math.sin(θRad) * h / 2;
    frame.y = position.y - Math.sin(θRad) * w / 2 - Math.cos(θRad) * h / 2;

    this.storeLineConnectionPoints(station, children);
    this.onRendered?.(station, frame);
  }

  private storeLineConnectionPoints(
    station: Station,
    lines: Array<{ line: Line; passIndex: number; node: SceneNode; passThrough: boolean }>,
  ): void {
    for (const { line, node, passIndex } of lines) {
      const transform = node.absoluteTransform;
      const width  = node.width;
      const height = node.height;

      const center = applyTransform(transform, { x: width / 2, y: height / 2 });
      this.lineConnectionPoints.set(`${station.id}-${line.id}-${passIndex}`, center);
    }
  }

  public getConnectionPoint(station: Station, line: Line, passIndex: number): Vector | undefined {
    return this.lineConnectionPoints.get(`${station.id}-${line.id}-${passIndex}`);
  }

  public clearConnectionPoints(): void {
    this.lineConnectionPoints.clear();
  }

  // Re-appending each station frame moves it to the top of the page's z-order,
  // above the road infrastructure and line segments brought to front just before this runs.
  public async bringStationsToFront(state: Readonly<MapState>): Promise<void> {
    for (const station of state.getStations()) {
      if (!station.figmaNodeId) continue;
      try {
        const frame = await figma.getNodeByIdAsync(station.figmaNodeId);
        if (frame && !frame.removed && frame.parent && 'appendChild' in frame.parent) {
          frame.parent.appendChild(frame as SceneNode);
        }
      } catch {}
    }
  }
}
