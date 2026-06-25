import { LineAtStationData, StationParams, StationPatch } from "@/common/messages";
import { LineId, RoadSectionId, StationId } from "@/common/types";
import { PlacingStationPluginSession } from "../sessions/placing-station";
import { postMessageToUI } from "../figma";
import { RoadSection } from "../models/structures";
import { findNearestRoadSection } from "../utils/snap";
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
  snap: { section: RoadSection; interpT: number } | null;
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

    const initialSnap = findNearestRoadSection(center, this.model.state);
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

      const snap = findNearestRoadSection(handleCenter, this.model.state);
      if (!snap) return;

      const previewNode = await figma.getNodeByIdAsync(previewId);
      if (!previewNode || previewNode.removed) return;
      const p = previewNode as EllipseNode;
      p.x = snap.pos.x - p.width / 2;
      p.y = snap.pos.y - p.height / 2;

      this.placingState.snap = { section: snap.section, interpT: snap.interpT };
    });

    this.placingState = {
      handleId,
      previewId,
      listenerHandle,
      snap: initialSnap ? { section: initialSnap.section, interpT: initialSnap.interpT } : null,
    };

    figma.currentPage.selection = [handle];
  }

  public async confirmPlacingMode({ name, textAlign, textHAlign, textRotation, flipped }: StationParams): Promise<void> {
    if (!this.placingState) return;
    const snap = this.placingState.snap;
    await this.cancelPlacingMode();

    const station = this.model.addStation({ name, textAlign, textHAlign, textRotation, flipped, interpT: snap?.interpT ?? 0.5, roadSection: snap?.section ?? null });
    await this.view.stationRenderer.renderStation(station, this.model.state);
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
    const roadSection = roadSectionId ? this.model.findSection(roadSectionId) : null;
    const station = this.model.addStation({ name, textAlign, textHAlign, textRotation, flipped, interpT, roadSection });
    await this.view.stationRenderer.renderStation(station, this.model.state);
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

  public async handleGetStationInfo(stationId: StationId): Promise<void> {
    const state = this.model.state;
    const station = state.stations.get(stationId);
    if (!station) {
      console.warn(`Station ${stationId} not found`);
      return;
    }

    const lines: Array<LineAtStationData> = [];
    for (const { line, path } of getStationStopsAcrossLines(station, state)) {
      const arrDir = line.getDirectionAtStop(path.index);
      const facing: 'left' | 'right' = arrDir === 'ascending' ? 'right' : 'left';
      lines.push({ id: line.id, name: line.name, color: line.color, pathIndex: path.index, rank: path.rank, facing, stops: path.stops });
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
    const station = this.model.state.stations.get(stationId);
    if (!station) return;
    station.updateStopRanks(stops);
    await this.render();
    await this.save();
    await this.handleGetStationInfo(stationId);
  }

  private async handleUpdateStation(stationId: StationId, { name, textAlign, textHAlign, textRotation, flipped }: StationParams): Promise<void> {
    const station = this.model.state.stations.get(stationId);
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
    const station = this.model.state.stations.get(stationId);
    if (!station) { console.warn(`Station ${stationId} not found`); return; }

    if (station.figmaNodeId) {
      const node = await figma.getNodeByIdAsync(station.figmaNodeId);
      if (node) node.remove();
    }

    this.model.removeStation(station);
    await this.save();
  }

  private async handleCopyStation(stationId: StationId, direction: 'forwards' | 'backwards'): Promise<void> {
    const station = this.model.state.stations.get(stationId);
    if (!station) { console.warn(`Station ${stationId} not found`); return; }

    const interpTOffset = direction === 'forwards' ? 0.1 : -0.1;
    const newInterpT = Math.max(0, Math.min(1, station.interpT + interpTOffset));

    const newStation = this.model.addStation({
      name: station.name,
      textAlign: station.textAlign,
      textHAlign: station.textHAlign,
      textRotation: station.textRotation,
      flipped: station.flipped,
      interpT: newInterpT,
      roadSection: station.roadSection ?? null,
    });

    if (this.connectionController) {
      const linesAtStation = station.getLineStackingRanks();
      for (const lineId of linesAtStation) {
        this.connectionController.insertStationIntoLine(lineId, newStation, station, direction === 'forwards');
      }
    }

    await this.view.stationRenderer.renderStation(newStation, this.model.state);
    await this.save();
    await this.handleSelectStation(newStation.id);
  }

  private async handleCombineStations(sourceStationId: StationId, targetStationId: StationId): Promise<void> {
    const sourceStation = this.model.state.stations.get(sourceStationId);
    const targetStation = this.model.state.stations.get(targetStationId);

    if (!sourceStation || !targetStation) {
      console.warn(`Station not found: ${sourceStationId} or ${targetStationId}`);
      return;
    }

    for (const line of this.model.state.lines.values()) {
      for (const path of line.paths) {
        if (path.kind === 'station-stop' && path.station === sourceStation) {
          path.station = targetStation;
        }
      }
    }

    if (sourceStation.figmaNodeId) {
      const node = await figma.getNodeByIdAsync(sourceStation.figmaNodeId);
      if (node) node.remove();
    }

    this.model.removeStation(sourceStation);
    await this.save();
  }

  public async handleSelectStation(stationId: StationId): Promise<void> {
    const station = this.model.state.stations.get(stationId);
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
