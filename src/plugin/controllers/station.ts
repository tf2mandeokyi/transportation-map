import { LineData } from "@/common/messages";
import { HVAlign, RoadSectionId, StationId } from "@/common/types";
import { postMessageToUI } from "../figma";
import { BaseController } from "./base";

export class StationController extends BaseController {
  public async handleAddStation(stopData: { name: string; textAlign: HVAlign; textRotation?: number; roadSectionId?: RoadSectionId; interpT?: number }): Promise<void> {
    const { name, textAlign, textRotation = 0, roadSectionId = null, interpT = 0.5 } = stopData;

    const id = this.createStation(name, textAlign, textRotation, roadSectionId, interpT);
    const station = this.model.getState().stations.get(id)!;

    await this.view.stationRenderer.renderStation(station, this.model.getState());
    await this.save();
  }

  public createStation(name: string, textAlign: HVAlign = 'right', textRotation: number = 0, roadSectionId: RoadSectionId | null = null, interpT: number = 0.5): StationId {
    return this.model.addStation({ name, textAlign, textRotation, interpT, roadSectionId });
  }

  public async handleGetStationInfo(stationId: StationId): Promise<void> {
    const station = this.model.getState().stations.get(stationId);
    if (!station) {
      console.warn(`Station ${stationId} not found`);
      return;
    }

    const lines: Array<LineData> = [];
    for (const line of this.model.getState().lines.values()) {
      const hasStop = line.paths.some(p => p.kind === 'station-stop' && p.stationId === stationId);
      if (hasStop) {
        lines.push({ id: line.id, name: line.name, color: line.color });
      }
    }

    postMessageToUI({
      type: 'station-clicked',
      stationId,
      stationName: station.name,
      textAlign: station.textAlign,
      textRotation: station.textRotation,
      lines
    });
  }

  public async handleUpdateStation(stationId: StationId, name: string, textAlign: HVAlign, textRotation: number): Promise<void> {
    const station = this.model.getState().stations.get(stationId);
    if (!station) {
      console.warn(`Station ${stationId} not found`);
      return;
    }

    station.name = name;
    station.textAlign = textAlign;
    station.textRotation = textRotation;

    await this.save();
    await this.handleGetStationInfo(stationId);
  }

  public async handleDeleteStation(stationId: StationId): Promise<void> {
    const station = this.model.getState().stations.get(stationId);
    if (!station) {
      console.warn(`Station ${stationId} not found`);
      return;
    }

    if (station.figmaNodeId) {
      const node = await figma.getNodeByIdAsync(station.figmaNodeId);
      if (node) node.remove();
    }

    this.model.removeStation(stationId);
    await this.save();
  }

  public async handleCopyStation(stationId: StationId, direction: 'forwards' | 'backwards'): Promise<void> {
    const station = this.model.getState().stations.get(stationId);
    if (!station) {
      console.warn(`Station ${stationId} not found`);
      return;
    }

    // Copy station with same road section but offset interpT
    const interpTOffset = direction === 'forwards' ? 0.1 : -0.1;
    const newInterpT = Math.max(0, Math.min(1, station.interpT + interpTOffset));

    const newStationId = this.model.addStation({
      name: station.name,
      textAlign: station.textAlign,
      textRotation: station.textRotation,
      interpT: newInterpT,
      roadSectionId: station.roadSectionId,
    });
    const newStation = this.model.getState().stations.get(newStationId)!;

    if (this.connectionController) {
      const linesAtStation = this.model.getLineStackingOrderForStation(stationId);
      for (const lineId of linesAtStation) {
        this.connectionController.insertStationIntoLine(lineId, newStationId, stationId, direction === 'forwards');
      }
    }

    await this.view.stationRenderer.renderStation(newStation, this.model.getState());
    await this.save();
    await this.handleSelectStation(newStationId);
  }

  public async handleCombineStations(sourceStationId: StationId, targetStationId: StationId): Promise<void> {
    const sourceStation = this.model.getState().stations.get(sourceStationId);
    const targetStation = this.model.getState().stations.get(targetStationId);

    if (!sourceStation || !targetStation) {
      console.warn(`Station not found: ${sourceStationId} or ${targetStationId}`);
      return;
    }

    // Rewrite all StationStop entries pointing to source → target
    for (const line of this.model.getState().lines.values()) {
      for (const path of line.paths) {
        if (path.kind === 'station-stop' && path.stationId === sourceStationId) {
          path.stationId = targetStationId;
        }
      }
    }

    if (sourceStation.figmaNodeId) {
      const node = await figma.getNodeByIdAsync(sourceStation.figmaNodeId);
      if (node) node.remove();
    }

    this.model.removeStation(sourceStationId);
    await this.save();
  }

  public async handleSelectStation(stationId: StationId): Promise<void> {
    const station = this.model.getState().stations.get(stationId);
    if (!station) {
      console.warn(`Station ${stationId} not found`);
      return;
    }

    if (station.figmaNodeId) {
      try {
        const node = await figma.getNodeByIdAsync(station.figmaNodeId);
        if (node && !node.removed) {
          figma.currentPage.selection = [node as SceneNode];
          figma.viewport.scrollAndZoomIntoView([node as SceneNode]);
        }
      } catch (error) {
        console.warn(`Could not select station ${stationId}:`, error);
      }
    }
  }
}
