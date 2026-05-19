import { UIToPluginMessage } from "@/common/messages";
import { LineId, StationId } from "@/common/types";
import { setUIMessageHandler } from "../figma";
import { Model } from "../models";
import { View } from "../views";
import { ConnectionController } from "./connection";
import { LineController } from "./line";
import { RenderController } from "./render";
import { StationController } from "./station";

export class Controller {
  private readonly model: Model;
  private readonly view: View;
  private readonly stationController: StationController;
  private readonly lineController: LineController;
  private readonly connectionController: ConnectionController;
  private readonly renderController: RenderController;

  constructor(model: Model, view: View) {
    this.model = model;
    this.view = view;

    this.stationController = new StationController(model, view);
    this.lineController = new LineController(model, view);
    this.connectionController = new ConnectionController(model, view);
    this.renderController = new RenderController(model, view);

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
    this.syncLinesToUI();
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
      figma.on('documentchange', (event) =>
        this.renderController.handleDocumentChange(event).catch(console.error)
      );
    } catch (error) {
      console.warn("Could not load all pages or set up document change handler:", error);
    }

    figma.on('selectionchange', () => this.connectionController.handleSelectionChange());
  }

  private handleUIMessage(msg: UIToPluginMessage): Promise<void> {
    switch (msg.type) {
      // Station actions
      case 'add-station': return this.stationController.handleAddStation(msg.station);
      case 'update-station': return this.stationController.handleUpdateStation(msg.stationId, msg.name, msg.textAlign);
      case 'delete-station': return this.stationController.handleDeleteStation(msg.stationId);
      case 'copy-station': return this.stationController.handleCopyStation(msg.stationId, msg.direction);
      case 'combine-stations': return this.stationController.handleCombineStations(msg.sourceStationId, msg.targetStationId);
      case 'select-station': return this.stationController.handleSelectStation(msg.stationId);

      // Road network actions
      case 'add-node': return this.handleAddNode(msg);
      case 'remove-node': return this.handleRemoveNode(msg.nodeId);
      case 'add-road': return this.handleAddRoad(msg);
      case 'remove-road': return this.handleRemoveRoad(msg.roadId);
      case 'add-road-section': return this.handleAddRoadSection(msg);
      case 'remove-road-section': return this.handleRemoveRoadSection(msg);

      // Line actions
      case 'add-line': return this.lineController.handleAddLine(msg.line);
      case 'remove-line': return this.lineController.handleRemoveLine(msg.lineId);
      case 'update-line-name': return this.lineController.handleUpdateLineName(msg.lineId, msg.name);
      case 'update-line-color': return this.lineController.handleUpdateLineColor(msg.lineId, msg.color);
      case 'update-line-stacking-order': return this.lineController.handleUpdateLineStackingOrder(msg.lineIds);

      // Connection actions
      case 'start-adding-stations-mode': return this.connectionController.handleStartAddingStationsMode(msg.lineId);
      case 'stop-adding-stations-mode': return this.connectionController.handleStopAddingStationsMode();
      case 'get-line-path': return this.connectionController.handleGetLinePath(msg.lineId);
      case 'remove-station-from-line': return this.connectionController.handleRemoveStationFromLine(msg.lineId, msg.pathIndex);
      case 'update-line-path': return this.connectionController.handleUpdateLinePath(msg.lineId, msg.paths);
      case 'rotate-line-path': return this.connectionController.handleRotateLinePath(msg.lineId, msg.steps);

      // Render actions
      case 'render-map': return this.renderController.handleRenderMap();

      // Misc
      case 'clear-plugin-data': return this.handleClearPluginData();
      case 'request-initial-data': return this.handleRequestInitialData();
    }
  }

  private async handleAddNode(msg: Extract<UIToPluginMessage, { type: 'add-node' }>): Promise<void> {
    this.model.addNode({ name: msg.node.name, pos: msg.node.pos, roadConnections: [] });
    await this.model.save();
  }

  private async handleRemoveNode(nodeId: import("../../common/types").NodeId): Promise<void> {
    this.model.removeNode(nodeId);
    await this.model.save();
  }

  private async handleAddRoad(msg: Extract<UIToPluginMessage, { type: 'add-road' }>): Promise<void> {
    this.model.addRoad({
      name: msg.road.name,
      startNodeId: msg.road.startNodeId,
      endNodeId: msg.road.endNodeId,
      endpoints: msg.road.endpoints,
      sections: new Map()
    });
    await this.model.save();
  }

  private async handleRemoveRoad(roadId: import("../../common/types").RoadId): Promise<void> {
    this.model.removeRoad(roadId);
    await this.model.save();
  }

  private async handleAddRoadSection(msg: Extract<UIToPluginMessage, { type: 'add-road-section' }>): Promise<void> {
    this.model.addRoadSection(msg.roadId, { ...msg.section, stationIds: [] });
    await this.model.save();
  }

  private async handleRemoveRoadSection(msg: Extract<UIToPluginMessage, { type: 'remove-road-section' }>): Promise<void> {
    this.model.removeRoadSection(msg.roadId, msg.sectionId);
    await this.model.save();
  }

  private async handleClearPluginData(): Promise<void> {
    figma.root.setPluginData('mapState', '');
    figma.closePlugin('Plugin data cleared. Please reopen the plugin.');
  }

  private async handleRequestInitialData(): Promise<void> {
    this.syncLinesToUI();
  }

  // Public API for demo map / external use
  public createStation(name: string, textAlign: import("../../common/types").HVAlign = 'right'): StationId {
    return this.stationController.createStation(name, textAlign);
  }

  public connectStationsWithLine(lineId: LineId, startStationId: StationId, endStationId: StationId): void {
    this.connectionController.connectStationsWithLine(lineId, startStationId, endStationId);
  }

  public syncLinesToUI(): void {
    this.lineController.syncLinesToUI();
  }
}
