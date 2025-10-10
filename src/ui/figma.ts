import { UIToPluginMessage } from "../common/messages";

export function postMessageToPlugin(message: UIToPluginMessage) {
  console.log('Posting message to plugin:', message);
  parent.postMessage({ pluginMessage: message }, "*");
}