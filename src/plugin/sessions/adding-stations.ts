import type { AnySessionMessage } from "@/common/sessions";
import { PluginSession } from "./base";

export class AddingStationsPluginSession extends PluginSession {
  async handleMessage(msg: AnySessionMessage): Promise<void> {
    if (msg.type === 'stop-adding-stations-mode') {
      console.log("Exited station-adding mode");
      this.end();
    }
  }
}
