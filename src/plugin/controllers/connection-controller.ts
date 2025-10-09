import { FigmaApi } from "../figma";
import { LineId, Station, StationId } from "../structures";
import { BaseController } from "./base-controller";

export class ConnectionController extends BaseController {
  private isAddingStationsMode: boolean = false;

  public async handleConnectStationsToLine(lineId: string, stationIds: string[], stopsAt: boolean): Promise<void> {
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
    await this.refresh();

    // Notify UI of success
    FigmaApi.postMessage({ type: 'stations-connected' });
  }

  public async handleStartAddingStationsMode(lineId: string): Promise<void> {
    this.isAddingStationsMode = true;
    console.log("Entered station-adding mode for line:", lineId);
  }

  public async handleStopAddingStationsMode(): Promise<void> {
    this.isAddingStationsMode = false;
    console.log("Exited station-adding mode");
  }

  public async handleGetLinePath(lineId: string): Promise<void> {
    const line = this.model.getState().lines.get(lineId as LineId);

    if (!line) {
      console.error("Line not found:", lineId);
      return;
    }

    // Get station names and stopsAt status for the path
    const stationIds: string[] = [];
    const stationNames: string[] = [];
    const stopsAt: boolean[] = [];

    for (const stationId of line.path) {
      const station = this.model.getState().stations.get(stationId);
      if (station) {
        stationIds.push(stationId);
        stationNames.push(station.name);
        const lineInfo = station.lines.get(lineId as LineId);
        stopsAt.push(lineInfo?.stopsAt ?? true);
      }
    }

    // Send path data to UI
    FigmaApi.postMessage({
      type: 'line-path-data',
      lineId,
      stationIds,
      stationNames,
      stopsAt
    });
  }

  public async handleRemoveStationFromLine(lineId: string, stationId: string): Promise<void> {
    this.model.removeStationFromLine(lineId as LineId, stationId as StationId);

    // Re-render the map
    await this.refresh();

    // Notify UI
    FigmaApi.postMessage({
      type: 'station-removed-from-line'
    });
  }

  public async handleSetLineStopsAtStation(lineId: string, stationId: string, stopsAt: boolean): Promise<void> {
    this.model.setLineStopsAtStation(lineId as LineId, stationId as StationId, stopsAt);

    // Re-render the map
    await this.refresh();

    // Send updated line path data
    await this.handleGetLinePath(lineId);
  }

  public connectStationsWithLine(lineId: LineId, startStationId: StationId, endStationId: StationId, stopsAtStart: boolean = true, stopsAtEnd: boolean = true): void {
    // Add stations to the line
    this.model.addStationToLine(lineId, startStationId, stopsAtStart);
    this.model.addStationToLine(lineId, endStationId, stopsAtEnd);
  }

  public handleSelectionChange(): void {
    const selection = figma.currentPage.selection;

    // If we're in adding-stations mode, handle clicks differently
    if (this.isAddingStationsMode && selection.length === 1) {
      const station = this.findStationFromNode(selection[0]);
      if (station) {
        // Send station click to UI
        FigmaApi.postMessage({
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
