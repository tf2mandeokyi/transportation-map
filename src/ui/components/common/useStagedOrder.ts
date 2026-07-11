import { useEffect, useState } from 'react';

// Stages a draggable-list reorder (and optionally other staged per-item edits, e.g. a
// stop-toggle) locally instead of committing on every drag-drop. `serverItems` is the
// source-of-truth order (typically recomputed fresh from props/context on every render);
// `getKey` identifies an item stably across renders so the staged order only resets when
// the *server* order actually changes — e.g. after Apply round-trips, or a different
// node/road/station is now being viewed — not on every render that happens to produce a
// new-but-equal array. `getDirtyValue` (defaults to `getKey`) controls what counts as a
// change for the isDirty flag — pass one that also serializes any other staged fields
// (e.g. `${getKey(item)}:${item.stops}`) so edits to those fields surface Apply/Cancel too.
export function useStagedOrder<T>(serverItems: T[], getKey: (item: T) => string, getDirtyValue: (item: T) => string = getKey) {
  const [order, setOrder] = useState(serverItems);
  const serverKey = serverItems.map(getKey).join('|');

  useEffect(() => {
    setOrder(serverItems);
    // Only serverKey should re-trigger this — serverItems is a fresh array every
    // render even when its contents haven't changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverKey]);

  const isDirty = order.map(getDirtyValue).join('|') !== serverItems.map(getDirtyValue).join('|');

  const cancel = () => setOrder(serverItems);

  return { order, setOrder, isDirty, cancel };
}
