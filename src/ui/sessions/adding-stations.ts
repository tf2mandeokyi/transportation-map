import type { AddingStationsMessage } from "@/common/sessions";
import type { LineId } from "@/common/types";
import type { FigmaPluginMessageManager } from "../events";
import { UISession } from "./base";

export class AddingStationsUISession extends UISession<AddingStationsMessage> {
  start(lineId: LineId, manager: FigmaPluginMessageManager): void {
    this.open({ type: 'start-adding-stations-mode', lineId }, manager);
  }
  stop(): void {
    this.send({ type: 'stop-adding-stations-mode' });
  }
}
