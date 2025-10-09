import { Model } from "./model";
import { LineId, Station, StationId, StationOrientation, Vector } from "./structures";
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

  private handleUIMessage(msg: any): Promise<void> {
    switch (msg.type) {
      case 'add-stop': return this.handleAddStop(msg.stop);
      case 'add-line': return this.handleAddLine(msg.line);
      case 'edit-line': return this.handleEditLine(msg.lineId);
      case 'remove-line': return this.handleRemoveLine(msg.lineId);
      case 'render-map': return this.handleRenderMap(msg.rightHandTraffic);
      case 'connect-stations-to-line': return this.handleConnectStationsToLine(msg.lineId, msg.stationIds, msg.stopsAt);
      default: console.log("Unknown message type:", msg.type); return Promise.resolve();
    }
  }

  private async handleAddStop(stopData: { name: string, orientation: StationOrientation, hidden: boolean }): Promise<void> {
    const { name, orientation, hidden } = stopData;

    // Get current selection position or use default
    const selection = figma.currentPage.selection;
    let position: Vector = { x: 100, y: 100 };

    if (selection.length > 0) {
      const node = selection[0];
      position = { x: node.x + 200, y: node.y };
    }

    this.createStation(name, position, hidden, orientation);
    await this.view.render(this.model.getState());

    figma.ui.postMessage({ type: 'stop-added' });
  }

  private async handleAddLine(lineData: { name: string, color: string }): Promise<void> {
    const { name, color } = lineData;
    // Convert hex color to RGB
    const rgb = this.hexToRgb(color);

    const lineId = this.model.addLine({ name, color: rgb, path: [] });
    await this.view.render(this.model.getState());

    // Send the line ID back to the UI so it can store it
    figma.ui.postMessage({
      type: 'line-added', lineId, name, color
    });
  }

  private async handleEditLine(lineId: string): Promise<void> {
    const line = this.model.getState().lines.get(lineId as LineId);

    if (line) {
      // For now, just log - in a full implementation you'd open an edit dialog
      console.log("Editing line:", line);
    }
  }

  private async handleRemoveLine(lineId: string): Promise<void> {
    this.model.removeLine(lineId as LineId);
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

    // Extract station IDs and names from selected bus stops
    const stationIds: string[] = [];
    const stationNames: string[] = [];
    const processedStations = new Set<string>(); // Avoid duplicates

    for (const node of selection) {
      const station = this.findStationFromNode(node);
      if (station) {
        // Skip if we've already processed this station
        if (processedStations.has(station.id)) {
          continue;
        }

        stationIds.push(station.id);
        stationNames.push(station.name);
        processedStations.add(station.id);
      }
    }

    // Send selection to UI
    figma.ui.postMessage({
      type: 'selection-changed',
      stationIds,
      stationNames
    });
  }

  private findStationFromNode(node: SceneNode): Station | null {
    // Recursively traverse up the parent chain to find a station node
    // by checking if the node ID matches any station's figmaNodeId
    let currentNode: BaseNode | null = node;

    while (currentNode && 'id' in currentNode) {
      const station = this.model.findStationByFigmaId(currentNode.id);
      if (station) {
        return station;
      }
      currentNode = currentNode.parent;
    }

    return null;
  }

  private async handleDocumentChange(event: DocumentChangeEvent): Promise<void> {
    // Handle station movements, deletions, etc.
    for (const change of event.documentChanges) {
      if (change.type === 'PROPERTY_CHANGE' && (change.properties.includes('x') || change.properties.includes('y'))) {
        // A station was moved - update our model if it's a bus stop
        try {
          const figmaNode = await figma.getNodeByIdAsync(change.id);
          if (figmaNode && 'x' in figmaNode && 'y' in figmaNode) {
            // Find the station using the figma node ID
            const station = this.model.findStationByFigmaId(change.id);
            if (station) {
              this.model.updateStationPosition(station.id, { x: figmaNode.x, y: figmaNode.y });
            }
          }
        } catch (error) {
          console.warn('Failed to get node by id:', change.id, error);
        }
      }
    }
  }

  public createStation(name: string, position: Vector, hidden: boolean = false, orientation: StationOrientation = 'RIGHT'): StationId {
    return this.model.addStation({
      name, position, hidden, orientation,
      lines: new Map()
    });
  }

  public connectStationsWithLine(lineId: LineId, startStationId: StationId, endStationId: StationId, stopsAtStart: boolean = true, stopsAtEnd: boolean = true): void {
    // Add stations to the line
    this.model.addStationToLine(lineId, startStationId, stopsAtStart);
    this.model.addStationToLine(lineId, endStationId, stopsAtEnd);
  }

  private async handleConnectStationsToLine(lineId: string, stationIds: string[], stopsAt: boolean): Promise<void> {
    const line = this.model.getState().lines.get(lineId as LineId);

    if (!line) {
      console.error("Line not found:", lineId);
      return;
    }

    // Add each station to the line's path in order
    for (const stationId of stationIds) {
      const station = this.model.getState().stations.get(stationId as StationId);
      if (station) {
        this.model.addStationToLine(lineId as LineId, stationId as StationId, stopsAt);
      } else {
        console.warn("Station not found:", stationId);
      }
    }

    // Re-render the map with updated connections
    await this.view.render(this.model.getState());

    // Notify UI of success
    figma.ui.postMessage({ type: 'stations-connected' });
  }
}