import { LineId, RoadId, RoadSectionId, StationId } from "@/common/types";
import { LinePathInput } from "@/common/messages";
import { AddingStationsPluginSession } from "../sessions/adding-stations";
import { LinePath, Station } from "../models/structures";
import { getStationStopsAcrossLines } from "../utils/line-queries";
import { postMessageToUI } from "../figma";
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

  public async handleGetLinePath(lineId: LineId): Promise<void> {
    const line = this.model.getState().lines.get(lineId);
    if (!line) { console.error("Line not found:", lineId); return; }

    const stationNames: Record<StationId, string> = {};
    const stationRoadIds: Record<StationId, RoadId | null> = {};
    const stationSectionIds: Record<StationId, RoadSectionId | null> = {};
    for (const path of line.paths) {
      if (path.kind === 'station-stop') {
        const station = path.station;
        stationNames[station.id] = station.name;
        stationRoadIds[station.id] = station.roadSection?.road?.id ?? null;
        stationSectionIds[station.id] = station.roadSection?.id ?? null;
      }
    }

    postMessageToUI({ type: 'line-path-data', lineId, paths: line.paths, stationNames, stationRoadIds, stationSectionIds });
  }

  public insertStationIntoLine(lineId: LineId, newStation: Station, relativeToStation: Station, insertAfter: boolean): boolean {
    const line = this.model.getState().lines.get(lineId);
    if (!line) return false;

    const refIndex = line.paths.findIndex(p => p.kind === 'station-stop' && p.station === relativeToStation);
    if (refIndex === -1) return false;

    const insertAt = insertAfter ? refIndex + 1 : refIndex;
    const newStop: { kind: 'station-stop'; stationId: StationId } = { kind: 'station-stop', stationId: newStation.id };

    const before = line.paths.slice(0, insertAt).map(p => this.pathToInput(p));
    const after  = line.paths.slice(insertAt).map(p => this.pathToInput(p));
    line.replacePaths([...before, newStop, ...after]);

    return true;
  }

  public connectStationsWithLine(lineId: LineId, startStation: Station, endStation: Station): void {
    const line = this.model.getState().lines.get(lineId);
    if (!line) return;

    const hasStart = line.paths.some(p => p.kind === 'station-stop' && p.station === startStation);
    if (!hasStart) {
      line.addPath({ kind: 'station-stop', stationId: startStation.id });
    }
    line.addPath({ kind: 'station-stop', stationId: endStation.id });
  }

  public handleSelectionChange(): void {
    const selection = figma.currentPage.selection;
    if (selection.length !== 1) return;

    const station = this.model.findStationFromNode(selection[0]);
    if (station) {
      const state = this.model.getState();
      const lines = [];
      for (const { line, path } of getStationStopsAcrossLines(station, state)) {
        const arrDir = line.getDirectionAtStop(path.index);
        const facing: 'left' | 'right' = arrDir === 'ascending' ? 'right' : 'left';
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

  private pathToInput(p: LinePath): LinePathInput {
    if (p.kind === 'station-stop') return { kind: 'station-stop', stationId: p.station.id };
    return { kind: 'road-section-change', nodeId: p.node.id, exiting: p.exiting?.id ?? null, entering: p.entering?.id ?? null };
  }
}
