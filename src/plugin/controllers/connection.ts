import { LineId } from "@/common/types";
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

  public handleSelectionChange(): void {
    const selection = figma.currentPage.selection;
    if (selection.length !== 1) return;

    const station = this.model.findStationFromNode(selection[0]);
    if (station) {
      postMessageToUI({
        type: 'station-clicked',
        stationId: station.id,
        station: { name: station.name, textAlign: station.textAlign, textHAlign: station.textHAlign, textVAlign: station.textVAlign, textRotation: station.textRotation, flipped: station.flipped },
        lines: station.getLinesAtStationData(),
      });
    }
  }
}
