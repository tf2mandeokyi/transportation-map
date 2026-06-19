import { HVAlign, LineId, StationId } from "@/common/types";
import { setUIMessageHandler } from "../figma";
import { Model } from "../models";
import { View } from "../views";
import { PluginSessionManager } from "../sessions/manager";
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
  }

  public async render(): Promise<void> {
    await this.view.render(this.model.getState());
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
    router.register('validate-line-paths', () => this.handleValidateLinePaths());
    router.register('clear-plugin-data',   () => this.handleClearPluginData());
    router.register('request-initial-data', () => this.handleRequestInitialData());

    setUIMessageHandler(async (payload) => {
      try {
        if ('sessionId' in payload) {
          await this.sessionManager.dispatch(payload.sessionId, payload.msg);
        } else {
          await router.dispatch(payload.msg);
        }
      } catch (error) {
        console.error("Error handling UI message:", error);
      }
    });

    try {
      await figma.loadAllPagesAsync();
      figma.on('documentchange', (event) => {
        this.renderController.handleDocumentChange(event).catch(console.error);
        this.networkController.handleDocumentChange(event).catch(console.error);
        for (const change of event.documentChanges) {
          this.listener.dispatch(change);
        }
      });
    } catch (error) {
      console.warn("Could not load all pages or set up document change handler:", error);
    }

    figma.on('selectionchange', () => {
      this.connectionController.handleSelectionChange();
      this.networkController.handleSelectionChange().catch(console.error);
    });
  }

  private async handleValidateLinePaths(): Promise<void> {
    this.model.validateAllLinePaths();
    await this.save();
  }

  private async handleClearPluginData(): Promise<void> {
    figma.root.setPluginData('mapState', '');
    figma.closePlugin('Plugin data cleared. Please reopen the plugin.');
  }

  private async handleRequestInitialData(): Promise<void> {
    this.lineController.syncLinesToUI();
    this.networkController.syncNetworkToUI();
  }

  // Public API for demo map / external use
  public createStation(name: string, textAlign: HVAlign = 'right'): StationId {
    return this.stationController.createStation(name, textAlign);
  }

  public connectStationsWithLine(lineId: LineId, startStationId: StationId, endStationId: StationId): void {
    this.connectionController.connectStationsWithLine(lineId, startStationId, endStationId);
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
