import { Line, MapState, Station } from "../structures";
import { Model } from "../model";
import { renderStation, renderStationLine } from "../figmls";
import { ErrorChain } from "../error";
import { LineId, StationId, StationOrientation } from "../../common/types";

export interface ConnectionPoints {
  head: Vector,
  tail: Vector
}

export class StationRenderer {
  private figmaStationMap: Map<StationId, SceneNode> = new Map();
  private lineConnectionPoints: Map<string, ConnectionPoints> = new Map();
  private model?: Model;

  constructor() {}

  public setModel(model: Model): void {
    this.model = model;
  }

  public async renderStation(station: Station, state: Readonly<MapState>): Promise<void> {
    let frame: FrameNode | null = null;
    if (station.figmaNodeId) {
      try { frame = await figma.getNodeByIdAsync(station.figmaNodeId) as FrameNode | null }
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

    // Clear existing children and rebuild
    frame.children.forEach(child => child.remove());

    // Position frame so that station.position is at the center
    frame.x = station.position.x - frame.width / 2;
    frame.y = station.position.y - frame.height / 2;

    // Use figml template to render the station
    await this.renderStationWithTemplate(frame, station, state);
  }

  private async renderStationWithTemplate(parentFrame: FrameNode, station: Station, state: Readonly<MapState>): Promise<void> {
    // Determine station configurations
    const isRightHandTraffic = this.model?.isRightHandTraffic() || true;
    const textLocation = this.getTextLocation(station.orientation, isRightHandTraffic);
    const rotation = this.getRotation(station.orientation);
    const stopLineFacing = this.getStopLineFacing(station.orientation);
    const reverseStationOrder = this.shouldReverseStationOrder(station.orientation, isRightHandTraffic);

    // Get lines for this station
    const lines = this.getLinesForStation(station, state);
    const children = await Promise.all(lines.map(async ({ line, segmentIndex, stopsAt }) => {
      const node = await renderStationLine({
          text: line.name,
          color: line.color,
          stops: stopsAt,
          visible: !station.hidden,
          facing: stopLineFacing
        })
        .intoNode()
        .catch(ErrorChain.thrower<SceneNode>(`Error rendering line ${line.name} at station ${station.name}`));
      return { line, segmentIndex, node };
    }));

    if (reverseStationOrder) {
      children.reverse();
    }

    // Render the station container using the station template
    const align = `${stopLineFacing},center` as const;
    const stationElement = await renderStation({
      text: station.name,
      visible: !station.hidden,
      rotation, children: children.map(c => c.node),
      align, textLocation
    }).intoNode();

    parentFrame.appendChild(stationElement);

    // After rendering, calculate and store the absolute center position of each line's dot
    this.storeLineConnectionPoints(station, children);
  }

  private getTextLocation(orientation: StationOrientation, isRightHandTraffic: boolean): 'left' | 'right' | 'top' | 'bottom' {
    switch (orientation) {
      case 'LEFT': return isRightHandTraffic ? 'top' : 'bottom';
      case 'RIGHT': return isRightHandTraffic ? 'bottom' : 'top';
      case 'UP': return isRightHandTraffic ? 'right' : 'left';
      case 'DOWN': return isRightHandTraffic ? 'left' : 'right';
      default: return 'top';
    }
  }

  private getRotation(orientation: StationOrientation): number {
    switch (orientation) {
      case 'UP': case 'DOWN': return 90; // Rotate 90 degrees for vertical orientations
      case 'LEFT': case 'RIGHT': return 0; // No rotation for horizontal orientations
    }
  }

  private getStopLineFacing(orientation: StationOrientation): 'left' | 'right' {
    switch (orientation) {
      case 'LEFT': case 'DOWN': return 'left';
      case 'RIGHT': case 'UP': return 'right';
    }
  }

  private shouldReverseStationOrder(orientation: StationOrientation, isRightHandTraffic: boolean): boolean {
    switch (orientation) {
      case 'LEFT': return !isRightHandTraffic;
      case 'RIGHT': return isRightHandTraffic;
      case 'UP': return !isRightHandTraffic;
      case 'DOWN': return isRightHandTraffic;
    }
  }

  private getLinesForStation(station: Station, state: Readonly<MapState>): Array<{line: Line, stopsAt: boolean, segmentIndex: number}> {
    if (!this.model) return [];

    // Collect all instances where lines visit this station (with their segment indices)
    const lineVisits: Array<{lineId: LineId, segmentIndex: number}> = [];

    for (const line of state.lines.values()) {
      // Find all positions where this station appears in the line's path
      for (let i = 0; i < line.path.length; i++) {
        if (line.path[i] === station.id) {
          lineVisits.push({ lineId: line.id, segmentIndex: i });
        }
      }
    }

    // Sort by: 1. global line stacking order, 2. segment index
    const globalStackingOrder = state.lineStackingOrder;
    lineVisits.sort((a, b) => {
      const orderA = globalStackingOrder.indexOf(a.lineId);
      const orderB = globalStackingOrder.indexOf(b.lineId);
      if (orderA !== orderB) return orderA - orderB;
      return a.segmentIndex - b.segmentIndex;
    });

    // Map to line objects with stopsAt info
    return lineVisits.map(visit => {
      const line = state.lines.get(visit.lineId);
      const lineInfo = station.lines.get(visit.lineId);
      return {
        line: line!,
        stopsAt: lineInfo?.stopsAt || false,
        segmentIndex: visit.segmentIndex
      };
    }).filter(item => item.line);
  }

  private storeLineConnectionPoints(station: Station, lines: Array<{line: Line, segmentIndex: number, node: SceneNode}>) {
    for (let i = 0; i < lines.length; i++) {
      const { line: stationLine, node: lineElement, segmentIndex } = lines[i];

      // Use absoluteTransform to calculate transformed positions
      // absoluteTransform is a 2x3 matrix: [[a, b, tx], [c, d, ty]]
      // where (tx, ty) is the top-left corner position
      const transform = lineElement.absoluteTransform;
      const width = lineElement.width;
      const height = lineElement.height;

      // Calculate the four corners of the element in absolute coordinates
      const topLeft = {
        x: transform[0][2],
        y: transform[1][2]
      };
      const topRight = {
        x: transform[0][2] + transform[0][0] * width,
        y: transform[1][2] + transform[1][0] * width
      };
      const bottomLeft = {
        x: transform[0][2] + transform[0][1] * height,
        y: transform[1][2] + transform[1][1] * height
      };
      const bottomRight = {
        x: transform[0][2] + transform[0][0] * width + transform[0][1] * height,
        y: transform[1][2] + transform[1][0] * width + transform[1][1] * height
      };

      // Calculate center of left, right, top, and bottom edges
      const centerLeft = {
        x: (topLeft.x + bottomLeft.x) / 2,
        y: (topLeft.y + bottomLeft.y) / 2
      };
      const centerRight = {
        x: (topRight.x + bottomRight.x) / 2,
        y: (topRight.y + bottomRight.y) / 2
      };

      let head: Vector;
      let tail: Vector;
      switch (station.orientation) {
        case 'LEFT':
          head = centerLeft;
          tail = centerRight;
          break;
        case 'RIGHT':
          head = centerRight;
          tail = centerLeft;
          break;
        case 'UP':
          head = centerRight;
          tail = centerLeft;
          break;
        case 'DOWN':
          head = centerLeft;
          tail = centerRight;
          break;
      }

      // Store the connection point with segment index
      const key = `${station.id}-${stationLine.id}-${segmentIndex}`;
      this.lineConnectionPoints.set(key, { head, tail });
    }
  }

  public getConnectionPoint(stationId: StationId, lineId: LineId, segmentIndex: number): ConnectionPoints | undefined {
    const key = `${stationId}-${lineId}-${segmentIndex}`;
    return this.lineConnectionPoints.get(key);
  }

  public clearConnectionPoints(): void {
    this.lineConnectionPoints.clear();
  }
}
