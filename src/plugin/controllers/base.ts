import { Model } from "../models";
import { View } from "../views";
import { ConnectionController } from "./connection";
import { NodeChangeListener } from "./listener";
import { PluginSessionManager } from "../sessions/manager";
import { Line, Node, Road, Station } from "../models/structures";
import { NodeId, RoadId } from "@/common/types";

export abstract class BaseController {
  protected readonly model: Model;
  protected readonly view: View;
  protected readonly listener: NodeChangeListener;
  protected readonly sessionManager: PluginSessionManager;
  protected connectionController?: ConnectionController;

  constructor(model: Model, view: View, listener: NodeChangeListener, sessionManager: PluginSessionManager) {
    this.model = model;
    this.view = view;
    this.listener = listener;
    this.sessionManager = sessionManager;
  }

  public setConnectionController(connectionController: ConnectionController): void {
    this.connectionController = connectionController;
  }

  protected async render(scope: { roads?: boolean } = {}): Promise<void> {
    this.model.validateAllLinePaths();
    await this.view.render(this.model.state, scope);
  }

  // For edits confined to specific stations/lines/roads/nodes. Skips the full
  // station+line(+road) re-render loop in favor of just the affected subset — see
  // View.renderPartial for how the touched set gets expanded to stay consistent.
  protected async renderPartial(scope: { stations?: Station[]; lines?: Line[]; roads?: Road[]; nodes?: Node[]; removedRoadIds?: readonly RoadId[]; removedNodeIds?: readonly NodeId[] }): Promise<void> {
    this.model.validateAllLinePaths();
    await this.view.renderPartial(this.model.state, scope);
  }

  protected async save(): Promise<void> {
    await this.model.save();
  }
}
