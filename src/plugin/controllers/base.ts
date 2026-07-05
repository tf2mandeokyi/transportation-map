import { Model } from "../models";
import { View } from "../views";
import { ConnectionController } from "./connection";
import { NodeChangeListener } from "./listener";
import { PluginSessionManager } from "../sessions/manager";

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

  protected async render(): Promise<void> {
    await this.view.render(this.model.state);
  }

  protected async save(): Promise<void> {
    await this.model.save();
  }
}
