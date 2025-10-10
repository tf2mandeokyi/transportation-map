
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
      type: 'line-added', lineId, name, color
    });
  }

  public async handleEditLine(lineId: LineId): Promise<void> {
    const line = this.model.getState().lines.get(lineId);

    if (line) {
      // For now, just log - in a full implementation you'd open an edit dialog
      console.log("Editing line:", line);
    }
  }

  public async handleRemoveLine(lineId: LineId): Promise<void> {
    this.model.removeLine(lineId);
    await this.refresh();
  }

  public syncLinesToUI(): void {
    const state = this.model.getState();
    for (const line of state.lines.values()) {
      const hexColor = this.rgbToHex(line.color);
      postMessageToUI({
        type: 'line-added',
        lineId: line.id,
        name: line.name,
        color: hexColor
      });
    }
  }
}
