import { Model } from "../models";
import { View } from "../views";
import { ConnectionController } from "./connection";

export abstract class BaseController {
  protected model: Model;
  protected view: View;
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

  protected hexToRgb(hex: string): RGB {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16) / 255,
      g: parseInt(result[2], 16) / 255,
      b: parseInt(result[3], 16) / 255
    } : { r: 1, g: 0, b: 0 };
  }
}
