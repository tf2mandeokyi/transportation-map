import { Model } from "../models";
import { View } from "../views";
import { ConnectionController } from "./connection";

export abstract class BaseController {
  protected readonly model: Model;
  protected readonly view: View;
  protected connectionController?: ConnectionController;

  constructor(model: Model, view: View) {
    this.model = model;
    this.view = view;
  }

  public setConnectionController(connectionController: ConnectionController): void {
    this.connectionController = connectionController;
  }

  protected async render(): Promise<void> {
    await this.view.render(this.model.getState());
  }

  protected async save(): Promise<void> {
    await this.model.save();
  }
}
