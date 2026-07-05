import React, { useEffect, useRef, useState } from 'react';

interface Props<T> {
  items: T[];
  getKey: (item: T) => string;
  getLineColor: (item: T) => string;
  getLineName: (item: T) => string;
  getColorOpacity?: (item: T) => number;
  getDimName?: (item: T) => boolean;
  right?: (item: T) => React.ReactNode;
  showRank?: boolean;
  getRank?: (item: T) => number;
  onCommit: (items: T[]) => void;
}

function DraggableLineList<T>({
  items, getKey, getLineColor, getLineName, getColorOpacity, getDimName, right, showRank, getRank, onCommit,
}: Props<T>) {
  const [displayItems, setDisplayItems] = useState(items);
  const itemsRef = useRef(items);
  useEffect(() => { setDisplayItems(items); itemsRef.current = items; }, [items]);

  const draggedIndexRef = useRef<number | null>(null);
  const onCommitRef = useRef(onCommit);
  useEffect(() => { onCommitRef.current = onCommit; }, [onCommit]);

  if (displayItems.length === 0) return null;

  return (
    <>
      {displayItems.map((item, index) => (
        <div
          key={getKey(item)}
          className="flex cursor-grab items-center justify-between rounded border border-neutral-200 bg-white px-2 hover:bg-neutral-100"
          draggable
          onDragStart={() => { draggedIndexRef.current = index; }}
          onDragEnd={() => {
            draggedIndexRef.current = null;
            onCommitRef.current(itemsRef.current);
          }}
          onDragOver={e => {
            e.preventDefault();
            const from = draggedIndexRef.current;
            if (from === null || from === index) return;
            const next = [...itemsRef.current];
            const [moved] = next.splice(from, 1);
            next.splice(index, 0, moved);
            itemsRef.current = next;
            draggedIndexRef.current = index;
            setDisplayItems(next);
          }}
          onDrop={e => e.preventDefault()}
        >
          <div className="flex flex-1 items-center gap-2">
            {showRank && <span className="min-w-[14px] text-right text-[11px] text-neutral-400">{getRank ? getRank(item) : index}</span>}
            <span className="text-xs text-neutral-400">⋮⋮</span>
            <div className="h-3 w-3 shrink-0 rounded-sm border border-black/10" style={{ backgroundColor: getLineColor(item), opacity: getColorOpacity?.(item) ?? 1 }} />
            <span className={getDimName?.(item) ? 'italic text-neutral-400' : ''}>{getLineName(item)}</span>
          </div>
          {right && (
            <div className="flex shrink-0 items-center gap-1.5">
              {right(item)}
            </div>
          )}
        </div>
      ))}
    </>
  );
}

export default DraggableLineList;
