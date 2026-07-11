import { postMessageToUI, setUIMessageHandler } from "../figma";
import { Model } from "../models";
import { View } from "../views";
import { PluginSessionManager } from "../sessions/manager";
import { HistoryManager } from "../models/history";
import { deserializeMapState, serializeMapState } from "../models/serde";
import { NodeChangeListener } from "./listener";
import { UIMessageRouter } from "./router";
import { ConnectionController } from "./connection";
import { LineController } from "./line";
import { NetworkController } from "./network";
import { RenderController } from "./render";
import { StationController } from "./station";

export class Controller {
  private readonly model: Model;
  private readonly view: View;
  private readonly listener: NodeChangeListener;
  private readonly sessionManager: PluginSessionManager;
  private readonly history = new HistoryManager();
  private readonly stationController: StationController;
  private readonly lineController: LineController;
  private readonly connectionController: ConnectionController;
  private readonly renderController: RenderController;
  private readonly networkController: NetworkController;

  constructor(model: Model, view: View) {
    this.model = model;
    this.view = view;
    this.listener = new NodeChangeListener();
    this.sessionManager = new PluginSessionManager();

    this.stationController    = new StationController(model, view, this.listener, this.sessionManager);
    this.lineController       = new LineController(model, view, this.listener, this.sessionManager);
    this.connectionController = new ConnectionController(model, view, this.listener, this.sessionManager);
    this.renderController     = new RenderController(model, view, this.listener, this.sessionManager);
    this.networkController    = new NetworkController(model, view, this.listener, this.sessionManager);

    this.stationController.setConnectionController(this.connectionController);
    this.view.stationRenderer.onRendered = (station, frame) => this.renderController.registerStationDragListener(station, frame);
  }

  public async render(): Promise<void> {
    this.model.validateAllLinePaths();
    await this.view.render(this.model.state);
  }

  public async save(): Promise<void> {
    await this.model.save();
  }

  public async refresh(): Promise<void> {
    await this.render();
    await this.save();
    this.lineController.syncLinesToUI();
    this.networkController.syncNetworkToUI();
  }

  public async initialize(): Promise<void> {
    console.log("Controller initialized. Listening for user actions.");

    const router = new UIMessageRouter();
    this.stationController.registerMessages(router);
    this.lineController.registerMessages(router);
    this.connectionController.registerMessages(router);
    this.renderController.registerMessages(router);
    this.networkController.registerMessages(router);
    router.register('clear-plugin-data',    () => this.handleClearPluginData());
    router.register('request-initial-data', () => this.handleRequestInitialData());
    router.register('get-map-data',         () => this.handleGetMapData());

    setUIMessageHandler(async (payload) => {
      try {
        if ('sessionId' in payload) {
          await this.dispatchWithCheckpoint(() => this.sessionManager.dispatch(payload.sessionId, payload.msg));
        } else if (payload.msg.type === 'undo') {
          await this.handleUndo();
        } else if (payload.msg.type === 'redo') {
          await this.handleRedo();
        } else {
          await this.dispatchWithCheckpoint(() => router.dispatch(payload.msg));
        }
      } catch (error) {
        console.error("Error handling UI message:", error);
      }
    });

    try {
      await figma.loadAllPagesAsync();
      figma.on('documentchange', (event) => {
        this.handleDocumentChangeWithCheckpoint(event).catch(console.error);
      });
    } catch (error) {
      console.warn("Could not load all pages or set up document change handler:", error);
    }

    figma.on('selectionchange', () => {
      this.connectionController.handleSelectionChange();
      this.networkController.handleSelectionChange().catch(console.error);
    });

    this.postUndoState();
  }

  // Discrete, already-complete actions (one-shot messages, and session Apply/Cancel
  // messages) — checkpoints the pre-action state iff the action actually mutated
  // anything, so a Cancel (which mutates nothing) never creates an empty undo step.
  private async dispatchWithCheckpoint(run: () => Promise<void>): Promise<void> {
    const before = serializeMapState(this.model.state);
    await run();
    const after = serializeMapState(this.model.state);
    if (before !== after) {
      this.history.checkpoint(before);
      this.postUndoState();
    }
  }

  // Continuous canvas-driven mutations (native Figma dragging of stations, nodes,
  // and road control handles) have no discrete UI message to hang a checkpoint off
  // of — this is the single chokepoint they all flow through, so it merges an
  // entire drag gesture into one undo step instead of one per frame.
  private async handleDocumentChangeWithCheckpoint(event: DocumentChangeEvent): Promise<void> {
    const before = serializeMapState(this.model.state);
    await this.networkController.handleDocumentChange(event);
    for (const change of event.documentChanges) {
      this.listener.dispatch(change);
    }
    const after = serializeMapState(this.model.state);
    if (before !== after) {
      this.history.checkpointGesture(before);
      this.postUndoState();
    }
  }

  private async handleUndo(): Promise<void> {
    const snapshot = this.history.undo(serializeMapState(this.model.state));
    if (snapshot) await this.restoreSnapshot(snapshot);
  }

  private async handleRedo(): Promise<void> {
    const snapshot = this.history.redo(serializeMapState(this.model.state));
    if (snapshot) await this.restoreSnapshot(snapshot);
  }

  private async restoreSnapshot(data: string): Promise<void> {
    this.model.state.clear();
    deserializeMapState(data, this.model.state);
    this.model.validateRoadSections();
    this.model.state.normalize();
    await this.refresh();
    this.postUndoState();
  }

  private postUndoState(): void {
    postMessageToUI({ type: 'undo-state', canUndo: this.history.canUndo, canRedo: this.history.canRedo });
  }

  private async handleClearPluginData(): Promise<void> {
    figma.root.setPluginData('mapState', '');
    figma.closePlugin('Plugin data cleared. Please reopen the plugin.');
  }

  private async handleRequestInitialData(): Promise<void> {
    this.lineController.syncLinesToUI();
    this.networkController.syncNetworkToUI();
  }

  private async handleGetMapData(): Promise<void> {
    const data = figma.root.getPluginData('mapState') || '';
    figma.ui.postMessage({ type: 'map-data', data });
  }

  public syncLinesToUI(): void {
    this.lineController.syncLinesToUI();
  }

  public syncNetworkToUI(): void {
    this.networkController.syncNetworkToUI();
  }

  public cleanup(): void {
    this.networkController.cleanup();
  }
}
