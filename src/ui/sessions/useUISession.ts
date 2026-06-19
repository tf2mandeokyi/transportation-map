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

  return { open, close };
}
