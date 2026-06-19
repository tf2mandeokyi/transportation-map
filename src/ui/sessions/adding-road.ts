import type { AddingRoadMessage } from "@/common/sessions";
import type { FigmaPluginMessageManager } from "../events";
import { UISession } from "./base";

export class AddingRoadUISession extends UISession<AddingRoadMessage> {
  start(manager: FigmaPluginMessageManager): void {
    this.open({ type: 'start-adding-road-mode' }, manager);
  }
  cancel(): void {
    this.send({ type: 'cancel-adding-road-mode' });
  }
}
