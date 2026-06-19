import type { PluginToUIMessage } from "@/common/messages";
import type { UIToPluginPayload } from "@/common/payload";

export function setUIMessageHandler(handler: (payload: UIToPluginPayload) => void) {
  figma.ui.onmessage = handler;
}

export function postMessageToUI(msg: PluginToUIMessage) {
  figma.ui.postMessage(msg);
}
