import type { AnySessionMessage } from "@/common/sessions";
import type { StationParams } from "@/common/messages";
import { PluginSession } from "./base";

export class PlacingStationPluginSession extends PluginSession {
  constructor(
    private readonly onConfirm: (station: StationParams) => Promise<void>,
    private readonly onCancel: () => Promise<void>,
  ) { super(); }

  async handleMessage(msg: AnySessionMessage): Promise<void> {
    if (msg.type === 'confirm-place-station') {
      await this.onConfirm(msg.station);
    } else if (msg.type === 'cancel-placing-station-mode') {
      await this.onCancel();
    }
    this.end();
  }
}
