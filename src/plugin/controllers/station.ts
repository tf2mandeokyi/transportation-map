import { LineAtStationData, StationParams, StationPatch } from "@/common/messages";
import { HVAlign, LineId, RoadSectionId, StationId, TextHAlign } from "@/common/types";
import { PlacingStationPluginSession } from "../sessions/placing-station";
import { postMessageToUI } from "../figma";
import { findNearestRoadSection } from "../utils/snap";
import { getLineDirectionAtStop, getLineDepartureAtStop } from "../utils/section";
import { getStationStopsAcrossLines } from "../utils/line-queries";
import { BaseController } from "./base";
import { ListenerHandle } from "./listener";
import { UIMessageRouter } from "./router";

const HANDLE_SIZE = 16;
const PREVIEW_SIZE = 10;
const HANDLE_FILL:  RGB = { r: 1,    g: 0.65, b: 0   };
const PREVIEW_FILL: RGB = { r: 0.08, g: 0.6,  b: 1   };
const WHITE:        RGB = { r: 1,    g: 1,    b: 1   };

interface PlacingState {
  handleId: string;
  previewId: string;
  listenerHandle: ListenerHandle;
  snap: { roadSectionId: RoadSectionId; interpT: number } | null;
}

export class StationController extends BaseController {
  private placingState: PlacingState | null = null;

  public registerMessages(router: UIMessageRouter): void {
    router.register('start-placing-station-mode', () => this.startPlacingSession());
    router.register('add-station', msg => this.handleAddStation(msg.station));
    router.register('patch-station', msg => this.handlePatchStation(msg.stationId, msg.patch));
    router.register('select-station', msg => this.handleSelectStation(msg.stationId));
    router.register('get-station-info', msg => this.handleGetStationInfo(msg.stationId));
  }

  // ── Placing mode ──────────────────────────────────────────────────────────

  private async startPlacingSession(): Promise<void> {
    await this.startPlacingMode();
    this.sessionManager.create(new PlacingStationPluginSession(
      station => this.confirmPlacingMode(station),
      () => this.cancelPlacingMode(),
    ));
  }

  private async startPlacingMode(): Promise<void> {
    await this.cancelPlacingMode();

    const center = figma.viewport.center;

    const handle = figma.createEllipse();
    handle.resize(HANDLE_SIZE, HANDLE_SIZE);
    handle.x = center.x - HANDLE_SIZE / 2;
    handle.y = center.y - HANDLE_SIZE / 2;
    handle.fills = [{ type: 'SOLID', color: HANDLE_FILL }];
    handle.strokes = [{ type: 'SOLID', color: WHITE }];
    handle.strokeWeight = 2;
    handle.name = '_station-placing-handle';
    figma.currentPage.appendChild(handle);

    const preview = figma.createEllipse();
    preview.resize(PREVIEW_SIZE, PREVIEW_SIZE);
    preview.fills = [{ type: 'SOLID', color: PREVIEW_FILL }];
    preview.strokes = [{ type: 'SOLID', color: WHITE }];
    preview.strokeWeight = 2;
    preview.locked = true;
    preview.name = '_station-placing-preview';
    figma.currentPage.appendChild(preview);

    const initialSnap = findNearestRoadSection(center, this.model.getState());
    if (initialSnap) {
      preview.x = initialSnap.pos.x - PREVIEW_SIZE / 2;
      preview.y = initialSnap.pos.y - PREVIEW_SIZE / 2;
    } else {
      preview.x = center.x - PREVIEW_SIZE / 2;
      preview.y = center.y - PREVIEW_SIZE / 2;
    }

    const handleId = handle.id;
    const previewId = preview.id;

    const listenerHandle = this.listener.register(handleId, async (change) => {
      if (change.type !== 'PROPERTY_CHANGE') return;
      if (!change.properties.includes('x') && !change.properties.includes('y')) return;
      if (!this.placingState) return;

      const handleNode = await figma.getNodeByIdAsync(handleId);
      if (!handleNode || handleNode.removed) return;
      const h = handleNode as EllipseNode;
      const handleCenter = { x: h.x + h.width / 2, y: h.y + h.height / 2 };

      const snap = findNearestRoadSection(handleCenter, this.model.getState());
      if (!snap) return;

      const previewNode = await figma.getNodeByIdAsync(previewId);
      if (!previewNode || previewNode.removed) return;
      const p = previewNode as EllipseNode;
      p.x = snap.pos.x - p.width / 2;
      p.y = snap.pos.y - p.height / 2;

      this.placingState.snap = { roadSectionId: snap.roadSectionId, interpT: snap.interpT };
    });

    this.placingState = {
      handleId,
      previewId,
      listenerHandle,
      snap: initialSnap ? { roadSectionId: initialSnap.roadSectionId, interpT: initialSnap.interpT } : null,
    };

    figma.currentPage.selection = [handle];
  }

  public async confirmPlacingMode({ name, textAlign, textHAlign, textRotation, flipped }: StationParams): Promise<void> {
    if (!this.placingState) return;
    const snap = this.placingState.snap;
    await this.cancelPlacingMode();

    const id = this.createStation(name, textAlign, textHAlign, textRotation, flipped, snap?.roadSectionId ?? null, snap?.interpT ?? 0.5);
    const station = this.model.getState().stations.get(id);
    if (!station) return;

    await this.view.stationRenderer.renderStation(station, this.model.getState());
    await this.save();
  }

  public async cancelPlacingMode(): Promise<void> {
    if (!this.placingState) return;
    const { handleId, previewId, listenerHandle } = this.placingState;
    listenerHandle.dispose();
    this.placingState = null;

    const handleNode = await figma.getNodeByIdAsync(handleId);
    if (handleNode && !handleNode.removed) handleNode.remove();
    const previewNode = await figma.getNodeByIdAsync(previewId);
    if (previewNode && !previewNode.removed) previewNode.remove();
  }

  // ── Message handlers ──────────────────────────────────────────────────────

  public async handleAddStation({ name, textAlign, textHAlign, textRotation, flipped, roadSectionId, interpT }: StationParams & { roadSectionId: RoadSectionId | null; interpT: number }): Promise<void> {
    const id = this.createStation(name, textAlign, textHAlign, textRotation, flipped, roadSectionId, interpT);
    const station = this.model.getState().stations.get(id);
    if (!station) return;

    await this.view.stationRenderer.renderStation(station, this.model.getState());
    await this.save();
  }

  private async handlePatchStation(stationId: StationId, patch: StationPatch): Promise<void> {
    switch (patch.op) {
      case 'update':            return this.handleUpdateStation(stationId, patch.station);
      case 'delete':            return this.handleDeleteStation(stationId);
      case 'copy':              return this.handleCopyStation(stationId, patch.direction);
      case 'combine':           return this.handleCombineStations(stationId, patch.targetStationId);
      case 'update-stop-ranks': return this.handleUpdateStationStopRanks(stationId, patch.stops);
    }
  }

  // ── Individual handlers ───────────────────────────────────────────────────

  public createStation(name: string, textAlign: HVAlign = 'right', textHAlign: TextHAlign = 'left', textRotation: number = 0, flipped: boolean = false, roadSectionId: RoadSectionId | null = null, interpT: number = 0.5): StationId {
    return this.model.addStation({ name, textAlign, textHAlign, textRotation, flipped, interpT, roadSectionId });
  }

  public async handleGetStationInfo(stationId: StationId): Promise<void> {
    const state = this.model.getState();
    const station = state.stations.get(stationId);
    if (!station) {
      console.warn(`Station ${stationId} not found`);
      return;
    }

    const lines: Array<LineAtStationData> = [];
    for (const { line, path } of getStationStopsAcrossLines(stationId, state)) {
      const arrDir = getLineDirectionAtStop(line, path.index, state);
      const facing: 'left' | 'right' = arrDir === 'forward' ? 'right' : 'left';
      lines.push({ id: line.id, name: line.name, color: line.color, pathIndex: path.index, rank: path.rank, facing, stops: path.stops });
      // U-turn: add a departure-direction entry when arrival and departure directions differ.
      const depDir = getLineDepartureAtStop(line, path.index, state);
      if (depDir !== null && depDir !== arrDir) {
        const depFacing: 'left' | 'right' = depDir === 'forward' ? 'right' : 'left';
        lines.push({ id: line.id, name: line.name, color: line.color, pathIndex: path.index, rank: path.rank, facing: depFacing, stops: false, departureRole: true });
      }
    }

    postMessageToUI({
      type: 'station-clicked',
      stationId,
      station: { name: station.name, textAlign: station.textAlign, textHAlign: station.textHAlign, textRotation: station.textRotation, flipped: station.flipped },
      lines,
    });
  }

  private async handleUpdateStationStopRanks(
    stationId: StationId,
    stops: Array<{ lineId: LineId; pathIndex: number; rank: number }>
  ): Promise<void> {
    this.model.updateStationStopRanks(stationId, stops);
    await this.render();
    await this.save();
    await this.handleGetStationInfo(stationId);
  }

  private async handleUpdateStation(stationId: StationId, { name, textAlign, textHAlign, textRotation, flipped }: StationParams): Promise<void> {
    const station = this.model.getState().stations.get(stationId);
    if (!station) { console.warn(`Station ${stationId} not found`); return; }

    station.name = name;
    station.textAlign = textAlign;
    station.textHAlign = textHAlign;
    station.textRotation = textRotation;
    station.flipped = flipped;

    await this.save();
    await this.handleGetStationInfo(stationId);
  }

  private async handleDeleteStation(stationId: StationId): Promise<void> {
    const station = this.model.getState().stations.get(stationId);
    if (!station) { console.warn(`Station ${stationId} not found`); return; }

    if (station.figmaNodeId) {
      const node = await figma.getNodeByIdAsync(station.figmaNodeId);
      if (node) node.remove();
    }

    this.model.removeStation(stationId);
    await this.save();
  }

  private async handleCopyStation(stationId: StationId, direction: 'forwards' | 'backwards'): Promise<void> {
    const station = this.model.getState().stations.get(stationId);
    if (!station) { console.warn(`Station ${stationId} not found`); return; }

    const interpTOffset = direction === 'forwards' ? 0.1 : -0.1;
    const newInterpT = Math.max(0, Math.min(1, station.interpT + interpTOffset));

    const newStationId = this.model.addStation({
      name: station.name,
      textAlign: station.textAlign,
      textHAlign: station.textHAlign,
      textRotation: station.textRotation,
      flipped: station.flipped,
      interpT: newInterpT,
      roadSectionId: station.roadSectionId,
    });
    const newStation = this.model.getState().stations.get(newStationId);
    if (!newStation) return;

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

  private async handleCombineStations(sourceStationId: StationId, targetStationId: StationId): Promise<void> {
    const sourceStation = this.model.getState().stations.get(sourceStationId);
    const targetStation = this.model.getState().stations.get(targetStationId);

    if (!sourceStation || !targetStation) {
      console.warn(`Station not found: ${sourceStationId} or ${targetStationId}`);
      return;
    }

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
    if (!station) { console.warn(`Station ${stationId} not found`); return; }

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
