import { useCallback, useRef } from 'react';
import type { AnySessionMessage } from '@/common/sessions';
import type { UISession } from './base';

export function useUISession<S extends UISession<AnySessionMessage>>() {
  const ref = useRef<S | null>(null);

  const open = useCallback((session: S): S => {
    ref.current = session;
    return session;
  }, []);

  const close = useCallback((cleanup?: (session: S) => void): void => {
    if (ref.current) {
      cleanup?.(ref.current);
      ref.current = null;
    }
  }, []);

  // Invokes `fn` on the currently-open session, if any, without closing it —
  // for messages that update session state mid-flight (e.g. toggling a mode).
  const send = useCallback((fn: (session: S) => void): void => {
    if (ref.current) fn(ref.current);
  }, []);

  return { open, close, send };
}
