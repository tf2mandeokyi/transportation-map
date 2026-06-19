import type { AnySessionMessage } from "@/common/sessions";
import type { UIToPluginMessage } from "@/common/messages";
import { postMessageToPlugin, postRawMessageToPlugin } from "../figma";
import type { FigmaPluginMessageManager } from "../events";

export abstract class UISession<TMsg extends AnySessionMessage> {
  private sessionId: string | null = null;

  protected open(initMsg: UIToPluginMessage, manager: FigmaPluginMessageManager): void {
    postMessageToPlugin(initMsg);
    const unsub = manager.onMessage('session-created', msg => {
      this.sessionId = msg.sessionId;
      unsub();
    });
  }

  protected send(msg: TMsg): void {
    if (!this.sessionId) { console.warn('Session not yet open'); return; }
    postRawMessageToPlugin({ sessionId: this.sessionId, msg });
  }
}
