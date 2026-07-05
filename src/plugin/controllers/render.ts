import { StationId } from "@/common/types";
import { RoadSection } from "../models/structures";
import { Station } from "../models/structures/station";
import { applyTransform } from "../utils/math";
import { BaseController } from "./base";
import { AnyDocumentChange, ListenerHandle } from "./listener";
import { UIMessageRouter } from "./router";

const MOVE_DEBOUNCE_MS = 500;
const RANGE_EPSILON = 1e-4;
// Below this, a re-projected t is treated as "no real movement" — this is what absorbs
// the PROPERTY_CHANGE events our own re-render produces (which would otherwise feed back
// into onStationMoved and re-render forever).
const MOVE_THRESHOLD = 1e-3;

export class RenderController extends BaseController {
  private isRendering = false;
  private renderDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly stationListeners = new Map<StationId, { nodeId: string; handle: ListenerHandle }>();

  public registerMessages(router: UIMessageRouter): void {
    router.register('render-map', () => this.handleRenderMap());
  }

  public async handleRenderMap(): Promise<void> {
    await this.render();
    await this.save();
  }

  // Wired up as View.stationRenderer.onRendered so every station frame — freshly created
  // or reused from a reload — gets exactly one live drag listener.
  public registerStationDragListener(station: Station, frame: FrameNode): void {
    const existing = this.stationListeners.get(station.id);
    if (existing && existing.nodeId === frame.id) return;
    existing?.handle.dispose();

    const handle = this.listener.register(frame.id, change => this.handleStationNodeChange(station, change));
    this.stationListeners.set(station.id, { nodeId: frame.id, handle });
  }

  private async handleStationNodeChange(station: Station, change: AnyDocumentChange): Promise<void> {
    if (change.type !== 'PROPERTY_CHANGE') return;
    if (!change.properties.includes('x') && !change.properties.includes('y')) return;
    if (this.isRendering || this.view.isRendering) return;

    const node = await figma.getNodeByIdAsync(change.id);
    if (!node || node.removed || node.type !== 'FRAME') return;

    this.onStationMoved(station, node as FrameNode);
  }

  // Inverse-projects the dragged frame's current center onto the station's road bezier,
  // clamps the resulting param to the range bounded by its immediate neighbors (or the
  // section ends), then debounces a full re-render/save so the frame snaps to the exact
  // computed position once dragging settles.
  private onStationMoved(station: Station, frame: FrameNode): void {
    const section = station.parentRoadSection as RoadSection | undefined;
    const bezier = section?.parentRoad.computeBezier();
    if (!section || !bezier) return;

    const center = applyTransform(frame.absoluteTransform, { x: frame.width / 2, y: frame.height / 2 });
    const rawT = bezier.nearestT(center);

    const { min, max } = station.getMovableRange();
    const clampedT = Math.min(max - RANGE_EPSILON, Math.max(min + RANGE_EPSILON, rawT));

    // Guards against reacting to the PROPERTY_CHANGE our own snap-back render produces.
    if (Math.abs(clampedT - station.rawInterpT) < MOVE_THRESHOLD) return;
    station.setInterpT(clampedT);

    if (this.renderDebounceTimer !== null) clearTimeout(this.renderDebounceTimer);
    this.renderDebounceTimer = setTimeout(async () => {
      this.renderDebounceTimer = null;
      this.isRendering = true;
      try { await this.render(); await this.save(); } finally { this.isRendering = false; }
    }, MOVE_DEBOUNCE_MS);
  }
}
