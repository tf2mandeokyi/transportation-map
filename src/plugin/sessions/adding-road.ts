import type { AnySessionMessage } from "@/common/sessions";
import { PluginSession } from "./base";

export class AddingRoadPluginSession extends PluginSession {
  constructor(
    private readonly onConfirm: () => Promise<void>,
    private readonly onCancel:  () => Promise<void>,
  ) { super(); }

  async handleMessage(msg: AnySessionMessage): Promise<void> {
    if (msg.type === 'confirm-adding-road') {
      await this.onConfirm();
      this.end();
    } else if (msg.type === 'cancel-adding-road-mode') {
      await this.onCancel();
      this.end();
    }
  }
}
