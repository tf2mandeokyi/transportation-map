import { LineId, RoadId, RoadSectionId, StationId } from "@/common/types";
import { LinePathData } from "@/common/messages";
import { AddingStationsPluginSession } from "../sessions/adding-stations";
import { LinePath, Station, StationStop } from "../models/structures";
import { postMessageToUI } from "../figma";
import { buildDisplayEntries } from "../utils/display-entries";
import { BaseController } from "./base";
import { UIMessageRouter } from "./router";

export class ConnectionController extends BaseController {
  public registerMessages(router: UIMessageRouter): void {
    router.register('start-adding-stations-mode', msg => this.handleStartAddingStationsMode(msg.lineId));
    router.register('get-line-path', msg => this.handleGetLinePath(msg.lineId));
  }

  public async handleStartAddingStationsMode(lineId: LineId): Promise<void> {
    console.log("Entered station-adding mode for line:", lineId);
    this.sessionManager.create(new AddingStationsPluginSession());
  }

  // ── Line path handler ────────────────────────────────────────────────────────

  public async handleGetLinePath(lineId: LineId): Promise<void> {
    const line = this.model.state.getLine(lineId);
    if (!line) { console.error("Line not found:", lineId); return; }

    const stationNames: Record<StationId, string> = {};
    const stationRoadIds: Record<StationId, RoadId | null> = {};
    const stationSectionIds: Record<StationId, RoadSectionId | null> = {};

    for (const path of line.paths) {
      if (path instanceof StationStop) {
        const station = path.station;
        stationNames[station.id] = station.name;
        stationRoadIds[station.id] = station.parentRoadSection?.parentRoad?.id ?? null;
        stationSectionIds[station.id] = station.parentRoadSection?.getRoadSectionId() ?? null;
      }
    }

    const displayEntries = buildDisplayEntries(line.paths);

    postMessageToUI({ type: 'line-path-data', lineId, paths: line.paths.map(p => LinePath.toData(p)), stationNames, stationRoadIds, stationSectionIds, displayEntries });
  }

  public insertStationIntoLine(lineId: LineId, newStation: Station, relativeToStation: Station, insertAfter: boolean): boolean {
    const line = this.model.state.getLine(lineId);
    if (!line) return false;

    const refIndex = line.paths.findIndex(p => p instanceof StationStop && p.station === relativeToStation);
    if (refIndex === -1) return false;

    const insertAt = insertAfter ? refIndex + 1 : refIndex;
    const newStop: LinePathData = { kind: 'station-stop', stationId: newStation.id, direction: 'ascending' };

    const before = line.paths.slice(0, insertAt).map(p => LinePath.toData(p));
    const after  = line.paths.slice(insertAt).map(p => LinePath.toData(p));
    line.replacePaths([...before, newStop, ...after]);

    return true;
  }

  public connectStationsWithLine(lineId: LineId, startStation: Station, endStation: Station): void {
    const line = this.model.state.getLine(lineId);
    if (!line) return;

    const hasStart = line.paths.some(p => p instanceof StationStop && p.station === startStation);
    if (!hasStart) {
      line.addPath({ kind: 'station-stop', stationId: startStation.id, direction: 'ascending' });
    }
    line.addPath({ kind: 'station-stop', stationId: endStation.id, direction: 'ascending' });
  }

  public handleSelectionChange(): void {
    const selection = figma.currentPage.selection;
    if (selection.length !== 1) return;

    const station = this.model.findStationFromNode(selection[0]);
    if (station) {
      const lines = [];
      for (const { line, path } of station.getStopsAcrossLines()) {
        const facing: 'left' | 'right' = path.direction === 'ascending' ? 'right' : 'left';
        lines.push({ id: line.id, name: line.name, color: line.color, pathIndex: path.index, rank: path.rank, facing, stops: path.stops });
      }
      postMessageToUI({
        type: 'station-clicked',
        stationId: station.id,
        station: { name: station.name, textAlign: station.textAlign, textHAlign: station.textHAlign, textRotation: station.textRotation, flipped: station.flipped },
        lines,
      });
    }
  }
}
