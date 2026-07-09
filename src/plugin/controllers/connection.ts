import { LineId } from "@/common/types";
import { Station } from "../models/structures";
import { postMessageToUI } from "../figma";
import { getLinePathData } from "../utils/get-line-path-data";
import { BaseController } from "./base";
import { UIMessageRouter } from "./router";

export class ConnectionController extends BaseController {
  public registerMessages(router: UIMessageRouter): void {
    router.register('get-line-path', msg => this.handleGetLinePath(msg.lineId));
  }

  // ── Line path handler ────────────────────────────────────────────────────────

  public async handleGetLinePath(lineId: LineId): Promise<void> {
    const data = getLinePathData(this.model.state, lineId);
    if (!data) { console.error("Line not found:", lineId); return; }

    postMessageToUI({ type: 'line-path-data', ...data });
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
      postMessageToUI({
        type: 'station-clicked',
        stationId: station.id,
        station: { name: station.name, textAlign: station.textAlign, textHAlign: station.textHAlign, textRotation: station.textRotation, flipped: station.flipped },
        lines: station.getLinesAtStationData(),
      });
    }
  }
}
