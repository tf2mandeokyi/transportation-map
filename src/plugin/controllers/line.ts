
import { LineId } from "../../common/types";
import { postMessageToUI } from "../figma";
import { BaseController } from "./base";

export class LineController extends BaseController {
  public async handleAddLine(lineData: { name: string, color: string }): Promise<void> {
    const { name, color } = lineData;
    // Convert hex color to RGB
    const rgb = this.hexToRgb(color);

    const lineId = this.model.addLine({ name, color: rgb, path: [] });
    await this.refresh();

    // Send the line ID back to the UI so it can store it
    postMessageToUI({
      type: 'line-added', id: lineId, name, color
    });
  }

  public async handleRemoveLine(lineId: LineId): Promise<void> {
    this.model.removeLine(lineId);
    await this.refresh();
  }

  public async handleUpdateLineName(lineId: LineId, name: string): Promise<void> {
    this.model.updateLineName(lineId, name);
    await this.refresh();

    // Send updated line data to UI
    const line = this.model.getState().lines.get(lineId);
    if (line) {
      postMessageToUI({
        type: 'line-added',
        id: lineId,
        name: line.name,
        color: this.rgbToHex(line.color)
      });
    }
  }

  public async handleUpdateLineColor(lineId: LineId, color: string): Promise<void> {
    const rgb = this.hexToRgb(color);
    this.model.updateLineColor(lineId, rgb);
    await this.refresh();

    // Send updated line data to UI
    const line = this.model.getState().lines.get(lineId);
    if (line) {
      postMessageToUI({
        type: 'line-added',
        id: lineId,
        name: line.name,
        color: this.rgbToHex(line.color)
      });
    }
  }

  public async handleUpdateLineStackingOrder(lineIds: LineId[]): Promise<void> {
    this.model.updateLineStackingOrder(lineIds);
    await this.refresh();
  }

  public syncLinesToUI(): void {
    const state = this.model.getState();
    for (const line of state.lines.values()) {
      const hexColor = this.rgbToHex(line.color);
      postMessageToUI({
        type: 'line-added',
        id: line.id,
        name: line.name,
        color: hexColor
      });
    }
  }
}
