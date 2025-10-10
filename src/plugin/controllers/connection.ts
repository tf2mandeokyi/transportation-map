import { LineId, StationId } from "../../common/types";
import { postMessageToUI } from "../figma";
import { BaseController } from "./base";

export class ConnectionController extends BaseController {
  public async handleStartAddingStationsMode(lineId: LineId): Promise<void> {
    console.log("Entered station-adding mode for line:", lineId);
  }

  public async handleStopAddingStationsMode(): Promise<void> {
    console.log("Exited station-adding mode");
  }

  public async handleGetLinePath(lineId: LineId): Promise<void> {
    const line = this.model.getState().lines.get(lineId);

    if (!line) {
      console.error("Line not found:", lineId);
      return;
    }

    // Get station names and stopsAt status for the path
    const stationIds: StationId[] = [];
    const stationNames: string[] = [];
    const stopsAt: boolean[] = [];

    for (const stationId of line.path) {
      const station = this.model.getState().stations.get(stationId);
      if (station) {
        stationIds.push(stationId);
        stationNames.push(station.name);
        const lineInfo = station.lines.get(lineId);
        stopsAt.push(lineInfo?.stopsAt ?? true);
      }
    }

    // Send path data to UI
    postMessageToUI({
      type: 'line-path-data',
      lineId,
      stationIds,
      stationNames,
      stopsAt
    });
  }

  public async handleRemoveStationFromLine(lineId: LineId, stationId: StationId): Promise<void> {
    this.model.removeStationFromLine(lineId, stationId);

    // Re-render the map
    await this.refresh();

    // Notify UI
    postMessageToUI({
      type: 'station-removed-from-line'
    });
  }

  public async handleSetLineStopsAtStation(lineId: LineId, stationId: StationId, stopsAt: boolean): Promise<void> {
    this.model.setLineStopsAtStation(lineId, stationId, stopsAt);

    // Re-render the map
    await this.refresh();

    // Send toggle confirmation message with updated state
    postMessageToUI({
      type: 'toggle-stops-at',
      lineId,
      stationId,
      stopsAt
    });
  }

  public async handleUpdateLinePath(lineId: LineId, stationIds: StationId[], stopsAt: boolean[]): Promise<void> {
    const line = this.model.getState().lines.get(lineId);

    if (!line) {
      console.error("Line not found:", lineId);
      return;
    }

    // Clear the existing path
    line.path = [];

    // Remove this line from all stations that had it
    for (const station of this.model.getState().stations.values()) {
      if (station.lines.has(lineId)) {
        station.lines.delete(lineId);
      }
    }

    // Add each station to the line's path with the corresponding stopsAt value
    for (let i = 0; i < stationIds.length; i++) {
      const stationId = stationIds[i];
      const stationStopsAt = stopsAt[i] ?? true;
      const station = this.model.getState().stations.get(stationId);

      if (station) {
        this.model.addStationToLine(lineId, stationId, stationStopsAt);
      } else {
        console.warn("Station not found:", stationId);
      }
    }

    // Re-render the map with updated connections
    await this.refresh();
  }

  public connectStationsWithLine(lineId: LineId, startStationId: StationId, endStationId: StationId, stopsAtStart: boolean = true, stopsAtEnd: boolean = true): void {
    // Add stations to the line
    this.model.addStationToLine(lineId, startStationId, stopsAtStart);
    this.model.addStationToLine(lineId, endStationId, stopsAtEnd);
  }

  public handleSelectionChange(): void {
    const selection = figma.currentPage.selection;

    // Handle station clicks for both adding stations mode and editing mode
    if (selection.length !== 1) { return }

    const station = this.model.findStationFromNode(selection[0]);
    if (station) {
      // Send station click to UI
      postMessageToUI({
        type: 'station-clicked',
        stationId: station.id,
        stationName: station.name,
        orientation: station.orientation,
        hidden: station.hidden,
        lines: Array.from(station.lines.entries()).map(([lineId, lineStopInfo]) => {
          const line = this.model.getState().lines.get(lineId);
          return {
            id: lineId,
            name: line ? line.name : "Unknown",
            color: line ? this.rgbToHex(line.color) : "#000000",
            stopsAt: lineStopInfo.stopsAt
          };
        })
      });
    }
  }
}
