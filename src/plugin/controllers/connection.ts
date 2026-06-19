import { LineId, RoadId, StationId } from "@/common/types";
import { LinePathInput } from "@/common/messages";
import { AddingStationsPluginSession } from "../sessions/adding-stations";
import { LinePath } from "../models/structures";
import { findRoadForSection, getLineDirectionAtStop } from "../utils/section";
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
    for (const path of line.paths) {
      if (path.kind === 'station-stop') {
        const station = this.model.getState().stations.get(path.stationId);
        if (station) {
          stationNames[path.stationId] = station.name;
          const road = station.roadSectionId ? findRoadForSection(station.roadSectionId, this.model.getState()) : null;
          stationRoadIds[path.stationId] = road?.id ?? null;
        }
      }
    }

    postMessageToUI({ type: 'line-path-data', lineId, paths: line.paths, stationNames, stationRoadIds });
  }

  public insertStationIntoLine(lineId: LineId, newStationId: StationId, relativeToStationId: StationId, insertAfter: boolean): boolean {
    const line = this.model.getState().lines.get(lineId);
    if (!line) return false;

    const refIndex = line.paths.findIndex(p => p.kind === 'station-stop' && p.stationId === relativeToStationId);
    if (refIndex === -1) return false;

    const insertAt = insertAfter ? refIndex + 1 : refIndex;
    const newStop: { kind: 'station-stop'; stationId: StationId } = { kind: 'station-stop', stationId: newStationId };

    const before = line.paths.slice(0, insertAt).map(p => this.pathToInput(p));
    const after  = line.paths.slice(insertAt).map(p => this.pathToInput(p));
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
      const state = this.model.getState();
      const lines = [];
      for (const line of state.lines.values()) {
        for (const path of line.paths) {
          if (path.kind === 'station-stop' && path.stationId === station.id) {
            const dir = getLineDirectionAtStop(line, path.index, state);
            const facing: 'left' | 'right' = dir === 'forward' ? 'right' : 'left';
            lines.push({ id: line.id, name: line.name, color: line.color, pathIndex: path.index, rank: path.rank, facing });
          }
        }
      }
      lines.sort((a, b) => a.rank - b.rank);
      postMessageToUI({
        type: 'station-clicked',
        stationId: station.id,
        station: { name: station.name, textAlign: station.textAlign, textHAlign: station.textHAlign, textRotation: station.textRotation },
        lines,
      });
    }
  }

  private pathToInput(p: LinePath): LinePathInput {
    if (p.kind === 'station-stop') return { kind: 'station-stop', stationId: p.stationId };
    return { kind: 'road-section-enter', sourceRoadId: p.sourceRoadId, nodeId: p.nodeId, destRoadId: p.destRoadId };
  }
}
