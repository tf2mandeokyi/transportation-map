import { LineId } from "@/common/types";
import { LinePatch, LinePathData } from "@/common/messages";
import { postMessageToUI } from "../figma";
import { BaseController } from "./base";
import { UIMessageRouter } from "./router";

export class LineController extends BaseController {
  public registerMessages(router: UIMessageRouter): void {
    router.register('add-line', msg => this.handleAddLine(msg.line));
    router.register('remove-line', msg => this.handleRemoveLine(msg.lineId));
    router.register('patch-line', msg => this.handlePatchLine(msg.lineId, msg.patch));
    router.register('update-line-stacking-order', msg => this.handleUpdateLineStackingOrder(msg.lineIds));
  }

  public async handleAddLine(lineData: { name: string; color: string; isCircular?: boolean }): Promise<void> {
    const { name, color, isCircular = false } = lineData;
    const line = this.model.addLine({ name, color, isCircular, paths: [] });
    await this.save();
    postMessageToUI({ type: 'line-added', id: line.id, name, color });
  }

  public async handleRemoveLine(lineId: LineId): Promise<void> {
    this.model.removeLine(lineId);
    await this.save();
  }

  private async handlePatchLine(lineId: LineId, patch: LinePatch): Promise<void> {
    switch (patch.op) {
      case 'update-name':    return this.handleUpdateLineName(lineId, patch.name);
      case 'update-color':   return this.handleUpdateLineColor(lineId, patch.color);
      case 'update-path':    return this.handleUpdateLinePath(lineId, patch.paths);
      case 'rotate-path':    return this.handleRotateLinePath(lineId, patch.steps);
      case 'remove-station': return this.handleRemoveStationFromLine(lineId, patch.pathIndex);
      case 'toggle-stops':   return this.handleToggleStops(lineId, patch.pathIndex, patch.stops);
    }
  }

  private async handleUpdateLineName(lineId: LineId, name: string): Promise<void> {
    const line = this.model.state.getLine(lineId);
    if (!line) return;
    line.name = name;
    await this.save();
    postMessageToUI({ type: 'line-added', id: lineId, name: line.name, color: line.color });
  }

  private async handleUpdateLineColor(lineId: LineId, color: string): Promise<void> {
    const line = this.model.state.getLine(lineId);
    if (!line) return;
    line.color = color;
    await this.save();
    postMessageToUI({ type: 'line-added', id: lineId, name: line.name, color: line.color });
  }

  private async handleUpdateLinePath(lineId: LineId, paths: LinePathData[]): Promise<void> {
    const line = this.model.state.getLine(lineId);
    if (!line) { console.error("Line not found:", lineId); return; }
    line.replacePaths(paths);
    await this.render();
    await this.save();
  }

  private async handleRemoveStationFromLine(lineId: LineId, pathIndex: number): Promise<void> {
    const line = this.model.state.getLine(lineId);
    if (!line) { console.warn(`Line ${lineId} not found`); return; }
    line.removePath(pathIndex);
    await this.render();
    await this.save();
    postMessageToUI({ type: 'station-removed-from-line' });
  }

  private async handleToggleStops(lineId: LineId, pathIndex: number, stops: boolean): Promise<void> {
    const line = this.model.state.getLine(lineId);
    if (!line) return;
    line.setStopFlag(pathIndex, stops);
    await this.render();
    await this.save();
    postMessageToUI({ type: 'station-removed-from-line' });
  }

  private async handleRotateLinePath(lineId: LineId, steps: number): Promise<void> {
    const line = this.model.state.getLine(lineId);
    if (!line) { console.error("Line not found:", lineId); return; }
    if (line.paths.length === 0) { console.warn("Cannot rotate empty path"); return; }

    const n = line.paths.length;
    const normalized = ((steps % n) + n) % n;
    if (normalized === 0) return;

    const rotated = [
      ...line.paths.slice(normalized),
      ...line.paths.slice(0, normalized),
    ].map(p => p.toData());

    line.replacePaths(rotated);
    await this.render();
    await this.save();
  }

  public async handleUpdateLineStackingOrder(lineIds: LineId[]): Promise<void> {
    this.model.updateLineStackingOrder(lineIds);
    await this.save();
  }

  public syncLinesToUI(): void {
    for (const line of this.model.state.getLines()) {
      postMessageToUI({ type: 'line-added', id: line.id, name: line.name, color: line.color });
    }
  }
}
