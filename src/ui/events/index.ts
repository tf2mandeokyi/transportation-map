import { PluginToUIMessage } from "../../common/messages";

export type FigmaPluginMessageListener<T extends PluginToUIMessage['type']> = (msg: Extract<PluginToUIMessage, { type: T }>) => void;

export class FigmaPluginMessageManager {
  private handlers: Partial<Record<PluginToUIMessage['type'], FigmaPluginMessageListener<any>>> = {};

  onMessage<T extends PluginToUIMessage['type']>(type: T, handler: FigmaPluginMessageListener<T>) {
    this.handlers[type] = handler;
  }

  handleMessage(msg: PluginToUIMessage) {
    console.log('Received message from plugin:', msg);
    const handler = this.handlers[msg.type] as FigmaPluginMessageListener<typeof msg.type> | undefined;
    if (!handler) throw new Error(`No handler for message type: ${msg.type}`);
    handler(msg);
  }
}