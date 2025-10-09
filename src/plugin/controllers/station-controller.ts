
import { StationId, StationOrientation } from "../../common/types";
import { FigmaApi } from "../figma";
import { BaseController } from "./base-controller";

export class StationController extends BaseController {
  public async handleAddStop(stopData: { name: string, orientation: StationOrientation, hidden: boolean }): Promise<void> {
    const { name, orientation, hidden } = stopData;

    // Get current selection position or use default
    const selection = figma.currentPage.selection;
    let position: Vector = { x: 100, y: 100 };

    if (selection.length > 0) {
      const node = selection[0];
      position = { x: node.x + 200, y: node.y };
    }

    this.createStation(name, position, hidden, orientation);
    await this.refresh();

    FigmaApi.postMessage({ type: 'stop-added' });
  }

  public createStation(name: string, position: Vector, hidden: boolean = false, orientation: StationOrientation = 'RIGHT'): StationId {
    return this.model.addStation({
      name, position, hidden, orientation,
      lines: new Map()
    });
  }
}
