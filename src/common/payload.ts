import type { UIToPluginMessage } from './messages';
import type { AnySessionMessage } from './sessions';

export type UIToPluginPayload =
  | { msg: UIToPluginMessage }
  | { sessionId: string; msg: AnySessionMessage };
