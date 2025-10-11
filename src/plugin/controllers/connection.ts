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

  public async handleRemoveStationFromLine(lineId: LineId, stationId: StationId, lineIndex: number): Promise<void> {
    const line = this.model.getState().lines.get(lineId);
    const station = this.model.getState().stations.get(stationId);

    if (!line || !station) {
      console.warn(`Line ${lineId} or Station ${stationId} not found`);
      return;
    }

    // Remove station from line path at the specific index
    if (lineIndex >= 0 && lineIndex < line.path.length) {
      line.path.splice(lineIndex, 1);
    }

    // Remove line from station only if this was the last occurrence in the path
    if (!line.path.includes(stationId)) {
      station.lines.delete(lineId);
    }

    // Re-render the map
    await this.save();

    // Notify UI
    postMessageToUI({
      type: 'station-removed-from-line'
    });
  }

  public async handleSetLineStopsAtStation(lineId: LineId, stationId: StationId, lineIndex: number | undefined, stopsAt: boolean): Promise<void> {
    const line = this.model.getState().lines.get(lineId);
    const station = this.model.getState().stations.get(stationId);

    if (!line || !station) {
      console.warn(`Line ${lineId} or Station ${stationId} not found`);
      return;
    }

    // If lineIndex is provided, verify the station at this index matches
    // If not provided, just update the station's line info (applies to all occurrences)
    if (lineIndex !== undefined) {
      if (line.path[lineIndex] !== stationId) {
        console.warn(`Station at index ${lineIndex} does not match ${stationId}`);
        return;
      }
    }

    // Update the station's line info
    const lineInfo = station.lines.get(lineId);
    if (lineInfo) {
      lineInfo.stopsAt = stopsAt;
    }

    // Re-render the map
    await this.save();

    // Send toggle confirmation message with updated state
    postMessageToUI({
      type: 'toggle-stops-at',
      lineId,
      stationId,
      stopsAt
    });
  }

  /**
   * Insert a station into a line's path relative to another station
   * @param lineId The line to modify
   * @param newStationId The station to insert
   * @param relativeToStationId The reference station
   * @param insertAfter If true, insert after the reference station; if false, insert before
   * @param stopsAt Whether the line stops at the new station
   * @returns true if insertion was successful, false otherwise
   */
  public insertStationIntoLine(
    lineId: LineId,
    newStationId: StationId,
    relativeToStationId: StationId,
    insertAfter: boolean,
    stopsAt: boolean
  ): boolean {
    const line = this.model.getState().lines.get(lineId);
    const newStation = this.model.getState().stations.get(newStationId);

    if (!line || !newStation) return false;

    // Find the index of the reference station
    const refIndex = line.path.indexOf(relativeToStationId);
    if (refIndex === -1) return false;

    // Insert new station at the appropriate position
    const insertIndex = insertAfter ? refIndex + 1 : refIndex;
    line.path.splice(insertIndex, 0, newStationId);

    // Add this line to the new station's lines map
    newStation.lines.set(lineId, { stopsAt });

    return true;
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
    await this.save();
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
