import { UIToPluginMessage } from "@/common/messages";

export class UIMessageRouter {
  private readonly handlers = new Map<string, (msg: UIToPluginMessage) => Promise<void>>();

  register<T extends UIToPluginMessage['type']>(
    type: T,
    handler: (msg: Extract<UIToPluginMessage, { type: T }>) => Promise<void>
  ): void {
    this.handlers.set(type, handler as (msg: UIToPluginMessage) => Promise<void>);
  }

  dispatch(msg: UIToPluginMessage): Promise<void> {
    const handler = this.handlers.get(msg.type);
    if (!handler) {
      console.warn(`No handler registered for message type: ${msg.type}`);
      return Promise.resolve();
    }
    return handler(msg);
  }
}
