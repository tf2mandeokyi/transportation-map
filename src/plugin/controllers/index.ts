import { UIToPluginMessage } from "../../common/messages";
import { LineId, StationId } from "../../common/types";
import { setUIMessageHandler } from "../figma";
import { Model } from "../model";
import { View } from "../view";
import { ConnectionController } from "./connection";
import { LineController } from "./line";
import { RenderController } from "./render";
import { StationController } from "./station";

export class Controller {
  private model: Model;
  private view: View;
  private stationController: StationController;
  private lineController: LineController;
  private connectionController: ConnectionController;
  private renderController: RenderController;

  constructor(model: Model, view: View) {
    this.model = model;
    this.view = view;

    // Initialize sub-controllers
    this.stationController = new StationController(model, view);
    this.lineController = new LineController(model, view);
    this.connectionController = new ConnectionController(model, view);
    this.renderController = new RenderController(model, view);
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
    this.syncLinesToUI();
  }

  public async initialize(): Promise<void> {
    console.log("Controller initialized. Listening for user actions.");

    // Listen for UI messages
    setUIMessageHandler(async (msg) => {
      try {
        await this.handleUIMessage(msg);
      } catch (error) {
        console.error("Error handling UI message:", error);
      }
    });

    // Load all pages before setting up document change handler
    try {
      await figma.loadAllPagesAsync();
      figma.on('documentchange', (event) =>
        this.renderController.handleDocumentChange(event).catch(console.error)
      );
    } catch (error) {
      console.warn("Could not load all pages or set up document change handler:", error);
    }

    // Listen for Figma events
    figma.on('selectionchange', () => this.connectionController.handleSelectionChange());
  }

  private handleUIMessage(msg: UIToPluginMessage): Promise<void> {
    switch (msg.type) {
      case 'add-stop': return this.stationController.handleAddStop(msg.stop);
      case 'add-line': return this.lineController.handleAddLine(msg.line);
      case 'edit-line': return this.lineController.handleEditLine(msg.lineId);
      case 'remove-line': return this.lineController.handleRemoveLine(msg.lineId);
      case 'render-map': return this.renderController.handleRenderMap(msg.rightHandTraffic);
      case 'start-adding-stations-mode': return this.connectionController.handleStartAddingStationsMode(msg.lineId);
      case 'stop-adding-stations-mode': return this.connectionController.handleStopAddingStationsMode();
      case 'get-line-path': return this.connectionController.handleGetLinePath(msg.lineId);
      case 'remove-station-from-line': return this.connectionController.handleRemoveStationFromLine(msg.lineId, msg.stationId);
      case 'set-line-stops-at-station': return this.connectionController.handleSetLineStopsAtStation(msg.lineId, msg.stationId, msg.stopsAt);
      case 'update-line-path': return this.connectionController.handleUpdateLinePath(msg.lineId, msg.stationIds, msg.stopsAt);
      case 'get-station-info': return this.stationController.handleGetStationInfo(msg.stationId);
      case 'update-station': return this.stationController.handleUpdateStation(msg.stationId, msg.name, msg.orientation, msg.hidden);
      case 'remove-line-from-station': return this.stationController.handleRemoveLineFromStation(msg.stationId, msg.lineId);
      case 'clear-plugin-data': return this.handleClearPluginData();
      case 'request-initial-data': return this.handleRequestInitialData();
    }
  }

  private async handleClearPluginData(): Promise<void> {
    figma.root.setPluginData('mapState', '');
    figma.closePlugin('Plugin data cleared. Please reopen the plugin.');
  }

  private async handleRequestInitialData(): Promise<void> {
    // Send all existing lines to the UI
    this.syncLinesToUI();
  }

  // Public API for creating stations (used by demo map)
  public createStation(name: string, position: { x: number; y: number }, hidden: boolean = false, orientation: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT' = 'RIGHT'): StationId {
    return this.stationController.createStation(name, position, hidden, orientation);
  }

  // Public API for connecting stations (used by demo map)
  public connectStationsWithLine(lineId: LineId, startStationId: StationId, endStationId: StationId, stopsAtStart: boolean = true, stopsAtEnd: boolean = true): void {
    this.connectionController.connectStationsWithLine(lineId, startStationId, endStationId, stopsAtStart, stopsAtEnd);
  }

  // Public API for syncing lines to UI (used on load)
  public syncLinesToUI(): void {
    this.lineController.syncLinesToUI();
  }
}
