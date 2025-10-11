
import { LineAtStationData } from "../../common/messages";
import { LineId, StationId, StationOrientation } from "../../common/types";
import { postMessageToUI } from "../figma";
import { BaseController } from "./base";

export class StationController extends BaseController {
  public async handleAddStation(stopData: { name: string, orientation: StationOrientation, hidden: boolean }): Promise<void> {
    const { name, orientation, hidden } = stopData;

    // Get current selection position or use default
    const selection = figma.currentPage.selection;
    let position: Vector = { x: 100, y: 100 };

    if (selection.length > 0) {
      const node = selection[0];
      position = { x: node.x + 200, y: node.y };
    }

    const id = this.createStation(name, position, hidden, orientation);
    this.view.stationRenderer.renderStation({ id, name, figmaNodeId: null, position, hidden, orientation, lines: new Map() }, this.model.getState());
    await this.save();

    postMessageToUI({ type: 'station-added' });
  }

  public createStation(name: string, position: Vector, hidden: boolean = false, orientation: StationOrientation = 'RIGHT'): StationId {
    return this.model.addStation({
      name, position, hidden, orientation,
      lines: new Map()
    });
  }

  public async handleGetStationInfo(stationId: StationId): Promise<void> {
    const station = this.model.getState().stations.get(stationId);
    if (!station) {
      console.warn(`Station ${stationId} not found`);
      return;
    }

    const lines: Array<LineAtStationData> = [];

    // Collect all lines that pass through this station
    for (const [lineId, lineStopInfo] of station.lines.entries()) {
      const line = this.model.getState().lines.get(lineId);
      if (line) {
        lines.push({
          id: lineId,
          name: line.name,
          color: this.rgbToHex(line.color),
          stopsAt: lineStopInfo.stopsAt
        });
      }
    }

    postMessageToUI({
      type: 'station-clicked',
      stationId,
      stationName: station.name,
      orientation: station.orientation,
      hidden: station.hidden,
      lines
    });
  }

  public async handleUpdateStation(stationId: StationId, name: string, orientation: StationOrientation, hidden: boolean): Promise<void> {
    const station = this.model.getState().stations.get(stationId);
    if (!station) {
      console.warn(`Station ${stationId} not found`);
      return;
    }

    // Update station properties
    station.name = name;
    station.orientation = orientation;
    station.hidden = hidden;

    await this.save();

    // Send updated station info back to UI
    await this.handleGetStationInfo(stationId);
  }

  public async handleDeleteStation(stationId: StationId): Promise<void> {
    const station = this.model.getState().stations.get(stationId);
    if (!station) {
      console.warn(`Station ${stationId} not found`);
      return;
    }

    // Delete the station's Figma node
    if (station.figmaNodeId) {
      const node = await figma.getNodeByIdAsync(station.figmaNodeId);
      if (node) {
        node.remove();
      }
    }

    // Remove the station from the model (also removes from all lines)
    this.model.removeStation(stationId);

    await this.save();
  }

  public async handleRemoveLineFromStation(stationId: StationId, lineId: string): Promise<void> {
    const station = this.model.getState().stations.get(stationId);
    if (!station) {
      console.warn(`Station ${stationId} not found`);
      return;
    }

    const typedLineId = lineId as LineId;

    // Remove the line from the station's lines map
    station.lines.delete(typedLineId);

    // Also remove this station from the line's path
    const line = this.model.getState().lines.get(typedLineId);
    if (line) {
      line.path = line.path.filter(sid => sid !== stationId);
    }

    await this.save();

    // Send updated station info back to UI
    await this.handleGetStationInfo(stationId);
  }

  public async handleCopyStation(stationId: StationId, direction: 'forwards' | 'backwards'): Promise<void> {
    const station = this.model.getState().stations.get(stationId);
    if (!station) {
      console.warn(`Station ${stationId} not found`);
      return;
    }

    // Calculate offset based on orientation and direction
    const offset = 100; // pixels
    const { dx, dy } = this.calculateCopyOffset(station.orientation, direction, offset);

    // Create new station at offset position
    const newPosition = {
      x: station.position.x + dx,
      y: station.position.y + dy
    };

    const newStationId = this.createStation(station.name, newPosition, station.hidden, station.orientation);
    const newStation = this.model.getState().stations.get(newStationId)!;

    // Copy line connections using ConnectionController
    if (this.connectionController) {
      const insertAfter = direction === 'forwards';
      for (const [lineId, lineStopInfo] of station.lines.entries()) {
        this.connectionController.insertStationIntoLine(
          lineId,
          newStationId,
          stationId,
          insertAfter,
          lineStopInfo.stopsAt
        );
      }
    }

    // Render the new station
    await this.view.stationRenderer.renderStation(newStation, this.model.getState());
    await this.save();
    await this.handleSelectStation(newStationId);
  }

  private calculateCopyOffset(
    orientation: StationOrientation,
    direction: 'forwards' | 'backwards',
    offset: number
  ): { dx: number; dy: number } {
    let dx = 0, dy = 0;

    if (direction === 'forwards') {
      switch (orientation) {
        case 'RIGHT': dx = offset; break;
        case 'LEFT': dx = -offset; break;
        case 'UP': dy = -offset; break;
        case 'DOWN': dy = offset; break;
      }
    } else { // backwards
      switch (orientation) {
        case 'RIGHT': dx = -offset; break;
        case 'LEFT': dx = offset; break;
        case 'UP': dy = offset; break;
        case 'DOWN': dy = -offset; break;
      }
    }

    return { dx, dy };
  }

  public async handleSelectStation(stationId: StationId): Promise<void> {
    const station = this.model.getState().stations.get(stationId);
    if (!station) {
      console.warn(`Station ${stationId} not found`);
      return;
    }

    // Get the station's Figma node and select it
    if (station.figmaNodeId) {
      try {
        const node = await figma.getNodeByIdAsync(station.figmaNodeId);
        if (node && !node.removed) {
          figma.currentPage.selection = [node as SceneNode];
          // Scroll to the selected node
          figma.viewport.scrollAndZoomIntoView([node as SceneNode]);
        }
      } catch (error) {
        console.warn(`Could not select station ${stationId}:`, error);
      }
    }
  }
}
