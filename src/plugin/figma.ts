import { PluginToUIMessage, UIToPluginMessage } from "../common/messages";

export namespace FigmaApi {
  export function setMessageHandler(handler: (msg: UIToPluginMessage) => void) {
    figma.ui.onmessage = handler;
  }

  export function postMessage(msg: PluginToUIMessage) {
    figma.ui.postMessage(msg);
  }
}