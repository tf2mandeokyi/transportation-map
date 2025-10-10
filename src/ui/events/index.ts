import { PluginToUIMessage } from "../../common/messages";

export type FigmaPluginMessageListener<T extends PluginToUIMessage['type']> = (msg: Extract<PluginToUIMessage, { type: T }>) => void;

export class FigmaPluginMessageManager {
  private handlers: Partial<Record<PluginToUIMessage['type'], FigmaPluginMessageListener<any>[]>> = {};

  onMessage<T extends PluginToUIMessage['type']>(type: T, handler: FigmaPluginMessageListener<T>): () => void {
    if (!this.handlers[type]) {
      this.handlers[type] = [];
    }
    this.handlers[type]!.push(handler);

    // Return unsubscribe function
    return () => {
      const handlers = this.handlers[type];
      if (handlers) {
        const index = handlers.indexOf(handler);
        if (index > -1) {
          handlers.splice(index, 1);
        }
      }
    };
  }

  handleMessage(msg: PluginToUIMessage) {
    console.log('Received message from plugin:', msg);
    const handlers = this.handlers[msg.type] as FigmaPluginMessageListener<typeof msg.type>[] | undefined;
    if (!handlers || handlers.length === 0) throw new Error(`No handler for message type: ${msg.type}`);
    handlers.forEach(handler => handler(msg));
  }
}