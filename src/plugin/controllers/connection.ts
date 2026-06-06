import { LineId, StationId } from "@/common/types";
import { LinePathInput } from "@/common/messages";
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

    const stationNames: Record<StationId, string> = {};
    for (const path of line.paths) {
      if (path.kind === 'station-stop') {
        const station = this.model.getState().stations.get(path.stationId);
        if (station) stationNames[path.stationId] = station.name;
      }
    }

    postMessageToUI({ type: 'line-path-data', lineId, paths: line.paths, stationNames });
  }

  public async handleRemoveStationFromLine(lineId: LineId, pathIndex: number): Promise<void> {
    const line = this.model.getState().lines.get(lineId);
    if (!line) {
      console.warn(`Line ${lineId} not found`);
      return;
    }

    this.model.removeLinePath(lineId, pathIndex);
    await this.save();

    postMessageToUI({ type: 'station-removed-from-line' });
  }

  public async handleUpdateLinePath(lineId: LineId, paths: LinePathInput[]): Promise<void> {
    const line = this.model.getState().lines.get(lineId);
    if (!line) {
      console.error("Line not found:", lineId);
      return;
    }

    this.model.replaceLinePaths(lineId, paths);
    await this.save();
  }

  public async handleRotateLinePath(lineId: LineId, steps: number): Promise<void> {
    const line = this.model.getState().lines.get(lineId);
    if (!line) {
      console.error("Line not found:", lineId);
      return;
    }

    if (line.paths.length === 0) {
      console.warn("Cannot rotate empty path");
      return;
    }

    const n = line.paths.length;
    const normalized = ((steps % n) + n) % n;
    if (normalized === 0) return;

    const toInput = (p: (typeof line.paths)[number]): LinePathInput =>
      p.kind === 'station-stop'
        ? { kind: 'station-stop', stationId: p.stationId }
        : { kind: 'road-section-enter', sourceRoadId: p.sourceRoadId, nodeId: p.nodeId, destRoadId: p.destRoadId };

    const rotated = [
      ...line.paths.slice(normalized),
      ...line.paths.slice(0, normalized)
    ].map(toInput);

    this.model.replaceLinePaths(lineId, rotated);

    await this.save();
  }

  public insertStationIntoLine(lineId: LineId, newStationId: StationId, relativeToStationId: StationId, insertAfter: boolean): boolean {
    const line = this.model.getState().lines.get(lineId);
    if (!line) return false;

    const refIndex = line.paths.findIndex(p => p.kind === 'station-stop' && p.stationId === relativeToStationId);
    if (refIndex === -1) return false;

    const insertAt = insertAfter ? refIndex + 1 : refIndex;
    const newStop: { kind: 'station-stop'; stationId: StationId } = { kind: 'station-stop', stationId: newStationId };

    const toInput = (p: (typeof line.paths)[number]): LinePathInput =>
      p.kind === 'station-stop'
        ? { kind: 'station-stop', stationId: p.stationId }
        : { kind: 'road-section-enter', sourceRoadId: p.sourceRoadId, nodeId: p.nodeId, destRoadId: p.destRoadId };

    const before = line.paths.slice(0, insertAt).map(toInput);
    const after = line.paths.slice(insertAt).map(toInput);
    this.model.replaceLinePaths(lineId, [...before, newStop, ...after]);

    return true;
  }

  public connectStationsWithLine(lineId: LineId, startStationId: StationId, endStationId: StationId): void {
    const line = this.model.getState().lines.get(lineId);
    if (!line) return;

    const hasStart = line.paths.some(p => p.kind === 'station-stop' && p.stationId === startStationId);
    if (!hasStart) {
      this.model.addLinePath(lineId, { kind: 'station-stop', stationId: startStationId });
    }
    this.model.addLinePath(lineId, { kind: 'station-stop', stationId: endStationId });
  }

  public handleSelectionChange(): void {
    const selection = figma.currentPage.selection;
    if (selection.length !== 1) return;

    const station = this.model.findStationFromNode(selection[0]);
    if (station) {
      const lines = [];
      for (const line of this.model.getState().lines.values()) {
        const hasStop = line.paths.some(p => p.kind === 'station-stop' && p.stationId === station.id);
        if (hasStop) {
          lines.push({ id: line.id, name: line.name, color: line.color });
        }
      }
      postMessageToUI({
        type: 'station-clicked',
        stationId: station.id,
        stationName: station.name,
        textAlign: station.textAlign,
        textRotation: station.textRotation,
        lines
      });
    }
  }
}
