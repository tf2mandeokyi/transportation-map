import { Line, MapState, Station, StationId } from "../structures";
import { Model } from "../model";
import { FigmlComponent, FigmlParser } from "../figml-parser";
import { figmlImportResolver } from "../figml/resources";
import busStopFigml from "../figml/bus-stop.figml";
import busStopLineFigml from "../figml/bus-stop-line.figml";
import { ErrorChain } from "../error";

export interface ConnectionPoints {
  head: {x: number, y: number},
  tail: {x: number, y: number}
}

export class StationRenderer {
  private figmaStationMap: Map<StationId, SceneNode> = new Map();
  private lineConnectionPoints: Map<string, ConnectionPoints> = new Map();
  private model?: Model;
  private busStopTemplate: FigmlComponent | null = null;
  private busStopLineTemplate: FigmlComponent | null = null;

  constructor() {
    FigmlParser.setImportResolver(figmlImportResolver);
    this.loadTemplates();
  }

  public setModel(model: Model): void {
    this.model = model;
  }

  private loadTemplates(): void {
    try {
      this.busStopTemplate = FigmlParser.parseComponent(busStopFigml);
      this.busStopLineTemplate = FigmlParser.parseComponent(busStopLineFigml);
      console.log('Figml templates loaded successfully');
    } catch (error) {
      console.error('Failed to load figml templates:', error);
    }
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
    if (!this.busStopTemplate || !this.busStopLineTemplate) {
      console.warn('Templates not loaded, falling back to basic rendering');
      return;
    }

    const isRightHandTraffic = this.model?.isRightHandTraffic() || true;

    // Determine text location based on orientation and traffic direction
    let textLocation = this.getTextLocation(station.orientation, isRightHandTraffic);
    let rotation = this.getRotation(station.orientation);

    // Get bus lines for this station
    const busLines = this.getBusLinesForStation(station, state);

    // Render individual bus lines using the bus-stop-line template in parallel
    const facing = this.getLineFacing(station.orientation);
    const children = await Promise.all(busLines.map(busLine =>
      this.busStopLineTemplate!.render({
        text: busLine.line.name,
        color: busLine.line.color,
        visible: busLine.stopsAt
      }, `facing:${facing}`)
      .intoNode()
      .catch(e => { throw new ErrorChain(`Error rendering line ${busLine.line.name} at station ${station.name}`, e) })
    ));

    // Render the bus stop container using the bus-stop template
    const busStopElement = await this.busStopTemplate.render({
      text: station.name,
      visible: !station.hidden,
      rotation, children,
      align: 'center,center'
    }, `textLocation:${textLocation}`).intoNode();

    parentFrame.appendChild(busStopElement);

    // After rendering, calculate and store the absolute center position of each line's dot
    this.storeLineConnectionPoints(parentFrame, station, busLines);
  }

  private getTextLocation(orientation: string, isRightHandTraffic: boolean): string {
    switch (orientation) {
      case 'left': return isRightHandTraffic ? 'bottom' : 'top';
      case 'right': return isRightHandTraffic ? 'top' : 'bottom';
      case 'up': return isRightHandTraffic ? 'right' : 'left';
      case 'down': return isRightHandTraffic ? 'left' : 'right';
      default: return 'top';
    }
  }

  private getRotation(orientation: string): number {
    switch (orientation) {
      case 'up':
      case 'down':
        return 270; // Rotate 270 degrees for vertical orientations
      default:
        return 0;
    }
  }

  private getLineFacing(orientation: string): string {
    switch (orientation) {
      case 'left':
      case 'down':
        return 'left';
      case 'right':
      case 'up':
        return 'right';
      default:
        return 'right';
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

      // Get absolute position of the line element's center
      const left = lineElement.absoluteTransform[0][2];
      const top = lineElement.absoluteTransform[1][2];

      let head: {x: number, y: number};
      let tail: {x: number, y: number};
      switch (station.orientation) {
        case 'LEFT':
          head = { x: left, y: top + lineElement.height / 2 };
          tail = { x: left + lineElement.width, y: top + lineElement.height / 2 };
          break;
        case 'RIGHT':
          head = { x: left + lineElement.width, y: top + lineElement.height / 2 };
          tail = { x: left, y: top + lineElement.height / 2 };
          break;
        case 'UP':
          head = { x: left + lineElement.width / 2, y: top };
          tail = { x: left + lineElement.width / 2, y: top + lineElement.height };
          break;
        case 'DOWN':
          head = { x: left + lineElement.width / 2, y: top + lineElement.height };
          tail = { x: left + lineElement.width / 2, y: top };
          break;
      }

      // Store the connection point
      const key = `${station.id}-${busLine.line.id}`;
      this.lineConnectionPoints.set(key, { head, tail });
    }
  }

  public getConnectionPoint(stationId: StationId, lineId: string): ConnectionPoints | undefined {
    const key = `${stationId}-${lineId}`;
    return this.lineConnectionPoints.get(key);
  }

  public clearConnectionPoints(): void {
    this.lineConnectionPoints.clear();
  }
}
