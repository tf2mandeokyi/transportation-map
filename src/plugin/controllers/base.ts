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

  // Allow setting connectionController after construction to avoid circular dependencies
  public setConnectionController(connectionController: ConnectionController): void {
    this.connectionController = connectionController;
  }

  // Re-render the view
  protected async render(): Promise<void> {
    await this.view.render(this.model.getState());
  }

  // Save the model
  protected async save(): Promise<void> {
    await this.model.save();
  }

  // Helper to convert hex to RGB
  protected hexToRgb(hex: string): RGB {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16) / 255,
      g: parseInt(result[2], 16) / 255,
      b: parseInt(result[3], 16) / 255
    } : { r: 1, g: 0, b: 0 }; // Default to red
  }

  // Helper to convert RGB to hex
  protected rgbToHex(rgb: RGB): string {
    const toHex = (value: number) => {
      const hex = Math.round(value * 255).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    };
    return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
  }
}
