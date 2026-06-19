import type { AddingRseMessage } from "@/common/sessions";
import type { FigmaPluginMessageManager } from "../events";
import { UISession } from "./base";

export class AddingRseUISession extends UISession<AddingRseMessage> {
  start(manager: FigmaPluginMessageManager): void {
    this.open({ type: 'start-adding-rse-mode' }, manager);
  }
  stop(): void {
    this.send({ type: 'stop-adding-rse-mode' });
  }
}
