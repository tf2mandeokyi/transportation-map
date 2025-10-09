import { Line, MapState, Station } from "../structures";
import { Model } from "../model";
import { renderBusStop, renderBusStopLine } from "../figmls";
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

    // Use figml template to render the bus stop
    await this.renderBusStopWithTemplate(frame, station, state);
  }

  private async renderBusStopWithTemplate(parentFrame: FrameNode, station: Station, state: Readonly<MapState>): Promise<void> {
    const isRightHandTraffic = this.model?.isRightHandTraffic() || true;

    // Determine text location based on orientation and traffic direction
    let textLocation = this.getTextLocation(station.orientation, isRightHandTraffic);
    let rotation = this.getRotation(station.orientation);

    // Get bus lines for this station
    const busLines = this.getBusLinesForStation(station, state);

    // Render individual bus lines using the bus-stop-line template in parallel
    const stopLineFacing = this.getStopLineFacing(station.orientation);
    const children = await Promise.all(busLines.map(busLine =>
      renderBusStopLine({
        text: busLine.line.name,
        color: busLine.line.color,
        stops: busLine.stopsAt,
        visible: !station.hidden,
        facing: stopLineFacing
      })
      .intoNode()
      .catch(ErrorChain.thrower<SceneNode>(`Error rendering line ${busLine.line.name} at station ${station.name}`))
    ));

    // Render the bus stop container using the bus-stop template
    const align = `${stopLineFacing},center` as const;
    const busStopElement = await renderBusStop({
      text: station.name,
      visible: !station.hidden,
      rotation, children,
      align, textLocation
    }).intoNode();

    parentFrame.appendChild(busStopElement);

    // After rendering, calculate and store the absolute center position of each line's dot
    this.storeLineConnectionPoints(parentFrame, station, busLines);
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

  private getBusLinesForStation(station: Station, state: Readonly<MapState>): Array<{line: Line, stopsAt: boolean}> {
    if (!this.model) return [];

    const linesAtNode = this.model.getLineStackingOrderForStation(station.id);
    return linesAtNode.map(lineId => {
      const line = state.lines.get(lineId);
      const lineInfo = station.lines.get(lineId);
      return {
        line: line!,
        stopsAt: lineInfo?.stopsAt || false
      };
    }).filter(line => line.line);
  }

  private storeLineConnectionPoints(parentFrame: FrameNode, station: Station, busLines: Array<{line: Line, stopsAt: boolean}>) {
    // Find the bus stop content frame (should be the first child of parentFrame)
    if (parentFrame.children.length === 0) return;

    const busStopContainer = parentFrame.children[0] as FrameNode;

    // Navigate to find the bus-stop-content frame and then its children container
    // Structure: busStopContainer -> bus-stop-content -> [rectangle, frame with children]
    const findContentFrame = (node: SceneNode): FrameNode | null => {
      if (node.name === "Bus stop content" && 'children' in node) {
        return node as FrameNode;
      }
      if ('children' in node) {
        for (const child of (node as FrameNode).children) {
          const result = findContentFrame(child);
          if (result) return result;
        }
      }
      return null;
    };

    const busStopContentFrame = findContentFrame(busStopContainer);
    if (!busStopContentFrame || busStopContentFrame.children.length < 2) return;

    // The second child is the frame containing the line elements
    const linesContainerFrame = busStopContentFrame.children[1] as FrameNode;
    if (!linesContainerFrame || !('children' in linesContainerFrame)) return;

    // Each child in linesContainerFrame corresponds to a bus line element
    const lineElements = linesContainerFrame.children;

    for (let i = 0; i < Math.min(lineElements.length, busLines.length); i++) {
      const lineElement = lineElements[i] as FrameNode;
      const busLine = busLines[i];

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

      // Store the connection point
      const key = `${station.id}-${busLine.line.id}`;
      this.lineConnectionPoints.set(key, { head, tail });
    }
  }

  public getConnectionPoint(stationId: StationId, lineId: LineId): ConnectionPoints | undefined {
    const key = `${stationId}-${lineId}`;
    return this.lineConnectionPoints.get(key);
  }

  public clearConnectionPoints(): void {
    this.lineConnectionPoints.clear();
  }
}
