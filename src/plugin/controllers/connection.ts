import { LineId, StationId } from "../../common/types";
import { postMessageToUI } from "../figma";
import { Station } from "../structures";
import { BaseController } from "./base";

export class ConnectionController extends BaseController {
  public async handleConnectStationsToLine(lineId: LineId, stationIds: StationId[], stopsAt: boolean): Promise<void> {
    const line = this.model.getState().lines.get(lineId);

    if (!line) {
      console.error("Line not found:", lineId);
      return;
    }

    // Clear the existing path first (replace, not append)
    line.path = [];

    // Add each station to the line's path in order
    for (const stationId of stationIds) {
      const station = this.model.getState().stations.get(stationId);
      if (station) {
        this.model.addStationToLine(lineId, stationId, stopsAt);
      } else {
        console.warn("Station not found:", stationId);
      }
    }

    // Re-render the map with updated connections
    await this.refresh();

    // Notify UI of success
    postMessageToUI({ type: 'stations-connected' });
  }

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

  public connectStationsWithLine(lineId: LineId, startStationId: StationId, endStationId: StationId, stopsAtStart: boolean = true, stopsAtEnd: boolean = true): void {
    // Add stations to the line
    this.model.addStationToLine(lineId, startStationId, stopsAtStart);
    this.model.addStationToLine(lineId, endStationId, stopsAtEnd);
  }

  public handleSelectionChange(): void {
    const selection = figma.currentPage.selection;

    // Handle station clicks for both adding stations mode and editing mode
    if (selection.length === 1) {
      const station = this.findStationFromNode(selection[0]);
      if (station) {
        // Send station click to UI
        postMessageToUI({
          type: 'station-clicked',
          stationId: station.id,
          stationName: station.name
        });
      }
    }
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
}
