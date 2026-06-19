import type { AnySessionMessage } from "@/common/sessions";
import { postMessageToUI } from "../figma";
import { PluginSession } from "./base";

export class PluginSessionManager {
  private readonly sessions = new Map<string, PluginSession>();
  private counter = 0;

  create(session: PluginSession): string {
    const sessionId = String(++this.counter);
    session.onEnd = () => this.sessions.delete(sessionId);
    this.sessions.set(sessionId, session);
    postMessageToUI({ type: 'session-created', sessionId });
    return sessionId;
  }

  async dispatch(sessionId: string, msg: AnySessionMessage): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) { console.warn('No session for id:', sessionId); return; }
    return session.handleMessage(msg);
  }
}
