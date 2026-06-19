import type { PlacingStationMessage } from "@/common/sessions";
import type { StationParams } from "@/common/messages";
import type { FigmaPluginMessageManager } from "../events";
import { UISession } from "./base";

export class PlacingStationUISession extends UISession<PlacingStationMessage> {
  start(manager: FigmaPluginMessageManager): void {
    this.open({ type: 'start-placing-station-mode' }, manager);
  }
  confirm(station: StationParams): void {
    this.send({ type: 'confirm-place-station', station });
  }
  cancel(): void {
    this.send({ type: 'cancel-placing-station-mode' });
  }
}
