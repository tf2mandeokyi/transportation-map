
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

    this.createStation(name, position, hidden, orientation);
    await this.refresh();

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

    await this.refresh();

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

    await this.refresh();
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

    await this.refresh();

    // Send updated station info back to UI
    await this.handleGetStationInfo(stationId);
  }
}
