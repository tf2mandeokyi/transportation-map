import { UIToPluginMessage } from "../common/messages";

export function postMessageToPlugin(message: UIToPluginMessage) {
    parent.postMessage({ pluginMessage: message }, "*");
}