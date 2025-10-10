import { PluginToUIMessage, UIToPluginMessage } from "../common/messages";

export function setUIMessageHandler(handler: (msg: UIToPluginMessage) => void) {
  figma.ui.onmessage = handler;
}

export function postMessageToUI(msg: PluginToUIMessage) {
  figma.ui.postMessage(msg);
}