import { FigmaApi } from "../figma";
import { LineId } from "../structures";
import { BaseController } from "./base-controller";

export class LineController extends BaseController {
  public async handleAddLine(lineData: { name: string, color: string }): Promise<void> {
    const { name, color } = lineData;
    // Convert hex color to RGB
    const rgb = this.hexToRgb(color);

    const lineId = this.model.addLine({ name, color: rgb, path: [] });
    await this.refresh();

    // Send the line ID back to the UI so it can store it
    FigmaApi.postMessage({
      type: 'line-added', lineId, name, color
    });
  }

  public async handleEditLine(lineId: string): Promise<void> {
    const line = this.model.getState().lines.get(lineId as LineId);

    if (line) {
      // For now, just log - in a full implementation you'd open an edit dialog
      console.log("Editing line:", line);
    }
  }

  public async handleRemoveLine(lineId: string): Promise<void> {
    this.model.removeLine(lineId as LineId);
    await this.refresh();
  }

  public syncLinesToUI(): void {
    const state = this.model.getState();
    for (const line of state.lines.values()) {
      const hexColor = this.rgbToHex(line.color);
      FigmaApi.postMessage({
        type: 'line-added',
        lineId: line.id,
        name: line.name,
        color: hexColor
      });
    }
  }
}
