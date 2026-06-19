import type { UIToPluginPayload } from "@/common/payload";
import type { UIToPluginMessage } from "@/common/messages";

export function postRawMessageToPlugin(payload: UIToPluginPayload) {
  console.log('Posting message to plugin:', payload);
  parent.postMessage({ pluginMessage: payload }, "*");
}

export function postMessageToPlugin(message: UIToPluginMessage) {
  postRawMessageToPlugin({ msg: message });
}
