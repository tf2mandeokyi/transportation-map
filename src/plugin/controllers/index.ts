import { HVAlign, LineId, StationId } from "@/common/types";
import { UIToPluginMessage } from "@/common/messages";
import { setUIMessageHandler } from "../figma";
import { Model } from "../models";
import { View } from "../views";
import { ConnectionController } from "./connection";
import { LineController } from "./line";
import { NetworkController } from "./network";
import { RenderController } from "./render";
import { StationController } from "./station";

export class Controller {
  private readonly model: Model;
  private readonly view: View;
  private readonly stationController: StationController;
  private readonly lineController: LineController;
  private readonly connectionController: ConnectionController;
  private readonly renderController: RenderController;
  private readonly networkController: NetworkController;

  constructor(model: Model, view: View) {
    this.model = model;
    this.view = view;

    this.stationController    = new StationController(model, view);
    this.lineController       = new LineController(model, view);
    this.connectionController = new ConnectionController(model, view);
    this.renderController     = new RenderController(model, view);
    this.networkController    = new NetworkController(model, view);

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

    setUIMessageHandler(async (msg) => {
      try {
        await this.handleUIMessage(msg);
      } catch (error) {
        console.error("Error handling UI message:", error);
      }
    });

    try {
      await figma.loadAllPagesAsync();
      figma.on('documentchange', (event) => {
        this.renderController.handleDocumentChange(event).catch(console.error);
        this.networkController.handleDocumentChange(event).catch(console.error);
      });
    } catch (error) {
      console.warn("Could not load all pages or set up document change handler:", error);
    }

    figma.on('selectionchange', () => {
      this.connectionController.handleSelectionChange();
      this.networkController.handleSelectionChange().catch(console.error);
    });
  }

  private handleUIMessage(msg: UIToPluginMessage): Promise<void> {
    switch (msg.type) {
      // Station actions
      case 'add-station':              return this.stationController.handleAddStation(msg.station);
      case 'update-station':           return this.stationController.handleUpdateStation(msg.stationId, msg.name, msg.textAlign, msg.textRotation);
      case 'delete-station':           return this.stationController.handleDeleteStation(msg.stationId);
      case 'copy-station':             return this.stationController.handleCopyStation(msg.stationId, msg.direction);
      case 'combine-stations':         return this.stationController.handleCombineStations(msg.sourceStationId, msg.targetStationId);
      case 'select-station':           return this.stationController.handleSelectStation(msg.stationId);

      // Road network actions
      case 'add-node':                 return this.networkController.handleAddNode(msg);
      case 'remove-node':              return this.networkController.handleRemoveNode(msg.nodeId);
      case 'start-adding-road-mode':   return this.networkController.startRoadCreationMode();
      case 'cancel-adding-road-mode':  return this.networkController.cancelRoadCreationMode();
      case 'remove-road':              return this.networkController.handleRemoveRoad(msg.roadId);
      case 'add-road-section':         return this.networkController.handleAddRoadSection(msg);
      case 'remove-road-section':      return this.networkController.handleRemoveRoadSection(msg);

      // Line actions
      case 'add-line':                       return this.lineController.handleAddLine(msg.line);
      case 'remove-line':                    return this.lineController.handleRemoveLine(msg.lineId);
      case 'update-line-name':               return this.lineController.handleUpdateLineName(msg.lineId, msg.name);
      case 'update-line-color':              return this.lineController.handleUpdateLineColor(msg.lineId, msg.color);
      case 'update-line-stacking-order':     return this.lineController.handleUpdateLineStackingOrder(msg.lineIds);

      // Connection actions
      case 'start-adding-stations-mode':     return this.connectionController.handleStartAddingStationsMode(msg.lineId);
      case 'stop-adding-stations-mode':      return this.connectionController.handleStopAddingStationsMode();
      case 'get-line-path':                  return this.connectionController.handleGetLinePath(msg.lineId);
      case 'remove-station-from-line':       return this.connectionController.handleRemoveStationFromLine(msg.lineId, msg.pathIndex);
      case 'update-line-path':               return this.connectionController.handleUpdateLinePath(msg.lineId, msg.paths);
      case 'rotate-line-path':               return this.connectionController.handleRotateLinePath(msg.lineId, msg.steps);

      // Render
      case 'render-map':                     return this.renderController.handleRenderMap();

      // Misc
      case 'clear-plugin-data':              return this.handleClearPluginData();
      case 'request-initial-data':           return this.handleRequestInitialData();
    }
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
