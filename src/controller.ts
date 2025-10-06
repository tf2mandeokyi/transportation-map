import { Model } from "./model";
import { Line, LineId, NodeId, NodeOrientation, Vector } from "./structures";
import { View } from "./view";

export class Controller {
  private model: Model;
  private view: View;

  constructor(model: Model, view: View) {
    this.model = model;
    this.view = view;
  }

  public async initialize(): Promise<void> {
    console.log("Controller initialized. Listening for user actions.");

    // Listen for UI messages
    figma.ui.onmessage = async (msg) => {
      try {
        await this.handleUIMessage(msg);
      } catch (error) {
        console.error("Error handling UI message:", error);
      }
    };

    // Load all pages before setting up document change handler
    try {
      await figma.loadAllPagesAsync();
      figma.on('documentchange', (event) => this.handleDocumentChange(event).catch(console.error));
    } catch (error) {
      console.warn("Could not load all pages or set up document change handler:", error);
    }

    // Listen for Figma events
    figma.on('selectionchange', () => this.handleSelectionChange());
  }

  private async handleUIMessage(msg: any): Promise<void> {
    switch (msg.type) {
      case 'add-stop':
        await this.handleAddStop(msg.stop);
        break;
      case 'add-line':
        await this.handleAddLine(msg.line);
        break;
      case 'edit-line':
        await this.handleEditLine(msg.lineName);
        break;
      case 'remove-line':
        await this.handleRemoveLine(msg.lineName);
        break;
      case 'render-map':
        await this.handleRenderMap(msg.rightHandTraffic);
        break;
      default:
        console.log("Unknown message type:", msg.type);
    }
  }

  private async handleAddStop(stopData: {name: string, orientation: NodeOrientation, hidden: boolean}): Promise<void> {
    const nodeId = stopData.name as NodeId;

    // Get current selection position or use default
    const selection = figma.currentPage.selection;
    let position: Vector = { x: 100, y: 100 };

    if (selection.length > 0) {
      const node = selection[0];
      position = { x: node.x + 200, y: node.y };
    }

    await this.createNode(nodeId, position, stopData.hidden, stopData.orientation);
    await this.view.render(this.model.getState());

    figma.ui.postMessage({ type: 'stop-added' });
  }

  private async handleAddLine(lineData: {name: string, color: string}): Promise<void> {
    const lineId = lineData.name as LineId;

    // Convert hex color to RGB
    const rgb = this.hexToRgb(lineData.color);

    const line: Line = {
      id: lineId,
      name: lineData.name,
      color: lineData.color,
      path: []
    };

    this.model.addLine(line);
    await this.view.render(this.model.getState());

    figma.ui.postMessage({ type: 'line-added' });
  }

  private async handleEditLine(lineName: string): Promise<void> {
    const lineId = lineName as LineId;
    const line = this.model.getState().lines.get(lineId);

    if (line) {
      // For now, just log - in a full implementation you'd open an edit dialog
      console.log("Editing line:", line);
    }
  }

  private async handleRemoveLine(lineName: string): Promise<void> {
    const lineId = lineName as LineId;
    this.model.removeLine(lineId);
    await this.view.render(this.model.getState());
  }

  private async handleRenderMap(rightHandTraffic: boolean): Promise<void> {
    this.model.setTrafficDirection(rightHandTraffic);
    await this.view.render(this.model.getState());
  }

  private hexToRgb(hex: string): RGB {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16) / 255,
      g: parseInt(result[2], 16) / 255,
      b: parseInt(result[3], 16) / 255
    } : { r: 1, g: 0, b: 0 }; // Default to red
  }

  private handleSelectionChange(): void {
    const selection = figma.currentPage.selection;

    // Enable interaction with selected nodes that represent bus stops
    for (const node of selection) {
      if (node.name.startsWith('Stop:')) {
        // This node represents a bus stop - we could enable editing here
        console.log("Selected bus stop:", node.name);
      }
    }
  }

  private async handleDocumentChange(event: DocumentChangeEvent): Promise<void> {
    // Handle node movements, deletions, etc.
    for (const change of event.documentChanges) {
      if (change.type === 'PROPERTY_CHANGE' && (change.properties.includes('x') || change.properties.includes('y'))) {
        // A node was moved - update our model if it's a bus stop
        try {
          const node = await figma.getNodeByIdAsync(change.id);
          if (node && 'x' in node && 'y' in node && node.name.startsWith('Stop:')) {
            const nodeId = node.name.replace('Stop: ', '') as NodeId;
            this.model.updateNodePosition(nodeId, { x: node.x, y: node.y });
          }
        } catch (error) {
          console.warn('Failed to get node by id:', change.id, error);
        }
      }
    }
  }

  public createNode(id: NodeId, position: Vector, hidden: boolean = false, orientation: NodeOrientation = 'RIGHT'): void {
    const frame = figma.createFrame();
    frame.name = `Stop: ${id}`;
    frame.x = position.x;
    frame.y = position.y;

    this.model.addNode({
      id: id,
      figmaNodeId: frame.id,
      position: position,
      hidden: hidden,
      orientation: orientation,
      lines: new Map()
    });
  }

  public async connectNodesWithLine(lineId: LineId, startNodeId: NodeId, endNodeId: NodeId, stopsAtStart: boolean = true, stopsAtEnd: boolean = true): Promise<void> {
    // Add nodes to the line
    this.model.addNodeToLine(lineId, startNodeId, stopsAtStart);
    this.model.addNodeToLine(lineId, endNodeId, stopsAtEnd);

    // Re-render to show the connection
    await this.view.render(this.model.getState());
  }
}