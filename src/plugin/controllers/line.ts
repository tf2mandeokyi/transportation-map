import { LineId } from "../../common/types";
import { postMessageToUI } from "../figma";
import { BaseController } from "./base";

export class LineController extends BaseController {
  public async handleAddLine(lineData: { name: string; color: string; isCircular?: boolean }): Promise<void> {
    const { name, color, isCircular = false } = lineData;
    const lineId = this.model.addLine({ name, color, isCircular, paths: [] });
    await this.save();

    postMessageToUI({ type: 'line-added', id: lineId, name, color });
  }

  public async handleRemoveLine(lineId: LineId): Promise<void> {
    this.model.removeLine(lineId);
    await this.save();
  }

  public async handleUpdateLineName(lineId: LineId, name: string): Promise<void> {
    this.model.updateLineName(lineId, name);
    await this.save();

    const line = this.model.getState().lines.get(lineId);
    if (line) {
      postMessageToUI({ type: 'line-added', id: lineId, name: line.name, color: line.color });
    }
  }

  public async handleUpdateLineColor(lineId: LineId, color: string): Promise<void> {
    this.model.updateLineColor(lineId, color);
    await this.save();

    const line = this.model.getState().lines.get(lineId);
    if (line) {
      postMessageToUI({ type: 'line-added', id: lineId, name: line.name, color: line.color });
    }
  }

  public async handleUpdateLineStackingOrder(lineIds: LineId[]): Promise<void> {
    this.model.updateLineStackingOrder(lineIds);
    await this.save();
  }

  public syncLinesToUI(): void {
    const state = this.model.getState();
    for (const lineId of state.lineStackingOrder) {
      const line = state.lines.get(lineId);
      if (line) {
        postMessageToUI({ type: 'line-added', id: line.id, name: line.name, color: line.color });
      }
    }
  }
}
