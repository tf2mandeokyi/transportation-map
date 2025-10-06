import { Line, LineId, MapState, Node, NodeId } from "./structures";
import { Model } from "./model";
import { FigmlParser, FigmlRenderer } from "./figml-parser";
import busStopFigml from "./figml/bus-stop.figml";
import busStopLineFigml from "./figml/bus-stop-line.figml";
import busStopTextFigml from "./figml/bus-stop-text.figml";
import busStopContentFigml from "./figml/bus-stop-content.figml";

export class View {
  private figmaLayerMap: Map<NodeId | LineId, SceneNode> = new Map();
  private model?: Model;
  private busStopTemplate: any;
  private busStopLineTemplate: any;

  constructor() {
    this.setupImportResolver();
    this.loadTemplates();
  }

  private setupImportResolver(): void {
    FigmlParser.setImportResolver((path: string) => {
      switch (path) {
        case 'bus-stop-text.figml':
          return busStopTextFigml;
        case 'bus-stop-content.figml':
          return busStopContentFigml;
        default:
          throw new Error(`Unknown import path: ${path}`);
      }
    });
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

  public async render(state: Readonly<MapState>): Promise<void> {
    // Render all nodes in parallel
    await Promise.all(
      Array.from(state.nodes.values()).map(node => this.renderNode(node, state))
    );

    // Render all lines in parallel
    await Promise.all(
      Array.from(state.lines.values()).map(line => this.renderLine(line, state))
    );
  }

  private async renderNode(node: Node, state: Readonly<MapState>): Promise<void> {
    let frame: FrameNode;

    try {
      frame = await figma.getNodeByIdAsync(node.figmaNodeId) as FrameNode;
    } catch {
      frame = figma.createFrame();
      frame.name = `Stop: ${node.id}`;
      this.figmaLayerMap.set(node.id, frame);
    }

    frame.x = node.position.x;
    frame.y = node.position.y;
    frame.fills = [];
    frame.clipsContent = false;

    // Clear existing children and rebuild
    frame.children.forEach(child => child.remove());

    // Use figml template to render the bus stop
    await this.renderBusStopWithTemplate(frame, node, state);
  }

  private async renderBusStopWithTemplate(parentFrame: FrameNode, node: Node, state: Readonly<MapState>): Promise<void> {
    if (!this.busStopTemplate || !this.busStopLineTemplate) {
      console.warn('Templates not loaded, falling back to basic rendering');
      return;
    }

    const isRightHandTraffic = this.model?.isRightHandTraffic() || true;

    // Determine text location based on orientation and traffic direction
    let textLocation = this.getTextLocation(node.orientation, isRightHandTraffic);
    let rotation = this.getRotation(node.orientation);

    // Get bus lines for this node
    const busLines = this.getBusLinesForNode(node, state);

    // Render individual bus lines using the bus-stop-line template in parallel
    const facing = this.getLineFacing(node.orientation);
    const lineRenderResults = busLines
      .filter(busLine => busLine.stopsAt || !node.hidden) // Show line if it stops OR if node is visible
      .map(busLine =>
        FigmlRenderer.renderComponent(
          this.busStopLineTemplate,
          {
            text: busLine.text,
            color: busLine.color
          },
          `facing:${facing}`
        )
      );

    await Promise.all(lineRenderResults.map(result => result.render()));
    const lineElements = lineRenderResults.map(result => result.node);

    // Render the bus stop container using the bus-stop template
    const { node: busStopElement, render } = FigmlRenderer.renderComponent(
      this.busStopTemplate,
      {
        text: node.id,
        visible: (!node.hidden).toString(),
        rotation: rotation.toString(),
        children: lineElements // This needs special handling in the renderer
      },
      `textLocation:${textLocation}`
    );

    if (busStopElement) {
      parentFrame.appendChild(busStopElement);
      await render();
    }
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

  private getBusLinesForNode(node: Node, state: Readonly<MapState>): Array<{text: string, color: string, stopsAt: boolean}> {
    if (!this.model) return [];

    const linesAtNode = this.model.getLineStackingOrderForNode(node.id);
    return linesAtNode.map(lineId => {
      const line = state.lines.get(lineId);
      const lineInfo = node.lines.get(lineId);
      return {
        text: line?.name || '',
        color: line?.color || '#000000',
        stopsAt: lineInfo?.stopsAt || false
      };
    }).filter(line => line.text);
  }

  private async renderLine(line: Line, state: Readonly<MapState>): Promise<void> {
    // This method will connect line segments between nodes
    // For now, we'll focus on rendering individual segments at nodes
    // Full line rendering between nodes can be added later for complete paths
  }

  private hexToRgb(hex: string): RGB {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16) / 255,
      g: parseInt(result[2], 16) / 255,
      b: parseInt(result[3], 16) / 255
    } : { r: 1, g: 0, b: 0 };
  }
}