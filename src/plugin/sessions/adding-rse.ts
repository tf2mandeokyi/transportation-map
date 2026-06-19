import type { AnySessionMessage } from "@/common/sessions";
import { PluginSession } from "./base";

export class AddingRsePluginSession extends PluginSession {
  constructor(private readonly onStop: () => void) { super(); }

  async handleMessage(msg: AnySessionMessage): Promise<void> {
    if (msg.type === 'stop-adding-rse-mode') {
      this.onStop();
      this.end();
    }
  }
}
