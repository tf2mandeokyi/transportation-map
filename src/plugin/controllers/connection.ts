import { LineId, RoadId, RoadSectionId, StationId } from "@/common/types";
import { AddingStationsPluginSession } from "../sessions/adding-stations";
import { Station, linePathsToData } from "../models/structures";
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

    for (const group of line.paths) {
      for (const stop of group.stationStops) {
        const station = stop.station;
        stationNames[station.id] = station.name;
        stationRoadIds[station.id] = station.parentRoadSection?.parentRoad?.id ?? null;
        stationSectionIds[station.id] = station.parentRoadSection?.getRoadSectionId() ?? null;
      }
    }

    const displayEntries = buildDisplayEntries(line.paths);

    postMessageToUI({ type: 'line-path-data', lineId, paths: linePathsToData(line.paths), stationNames, stationRoadIds, stationSectionIds, displayEntries });
  }

  public insertStationIntoLine(lineId: LineId, newStation: Station, relativeToStation: Station, insertAfter: boolean): boolean {
    const line = this.model.state.getLine(lineId);
    if (!line) return false;

    let found: { groupIndex: number; stopIndex: number } | null = null;
    for (const [groupIndex, group] of line.paths.entries()) {
      const stopIndex = group.stationStops.findIndex(s => s.station === relativeToStation);
      if (stopIndex !== -1) { found = { groupIndex, stopIndex }; break; }
    }
    if (!found) return false;

    // insertStationStopAt inserts right after the given address, so inserting
    // "before" addresses the entry immediately preceding the reference stop.
    if (insertAfter) {
      line.insertStationStopAt(found.groupIndex, found.stopIndex, { stationId: newStation.id, direction: 'ascending' });
    } else {
      line.insertStationStopAt(found.groupIndex, found.stopIndex - 1, { stationId: newStation.id, direction: 'ascending' });
    }

    return true;
  }

  public connectStationsWithLine(lineId: LineId, startStation: Station, endStation: Station): void {
    const line = this.model.state.getLine(lineId);
    if (!line) return;

    const hasStart = line.paths.some(group => group.stationStops.some(s => s.station === startStation));
    if (!hasStart) {
      line.appendStationStop({ stationId: startStation.id, direction: 'ascending' });
    }
    line.appendStationStop({ stationId: endStation.id, direction: 'ascending' });
  }

  public handleSelectionChange(): void {
    const selection = figma.currentPage.selection;
    if (selection.length !== 1) return;

    const station = this.model.findStationFromNode(selection[0]);
    if (station) {
      const lines = [];
      for (const { line, path, groupIndex, stopIndex } of station.getStopsAcrossLines()) {
        const facing: 'left' | 'right' = path.direction === 'ascending' ? 'right' : 'left';
        lines.push({ id: line.id, name: line.name, color: line.color, groupIndex, stopIndex, rank: path.rank, facing, stops: path.stops });
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
