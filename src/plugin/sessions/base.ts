import type { AnySessionMessage } from "@/common/sessions";

export abstract class PluginSession {
  onEnd?: () => void;
  abstract handleMessage(msg: AnySessionMessage): Promise<void>;
  protected end(): void { this.onEnd?.(); }
}
