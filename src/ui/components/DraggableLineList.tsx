import React, { useEffect, useRef, useState } from 'react';

interface Props<T> {
  items: T[];
  getKey: (item: T) => string;
  getLineColor: (item: T) => string;
  getLineName: (item: T) => string;
  getColorOpacity?: (item: T) => number;
  getDimName?: (item: T) => boolean;
  right?: (item: T) => React.ReactNode;
  onCommit: (items: T[]) => void;
}

function DraggableLineList<T>({
  items, getKey, getLineColor, getLineName, getColorOpacity, getDimName, right, onCommit,
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
          className="station-path-item"
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
          style={{ cursor: 'grab' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
            <span style={{ color: '#999', fontSize: '12px' }}>⋮⋮</span>
            <div style={{ width: '12px', height: '12px', backgroundColor: getLineColor(item), borderRadius: '2px', border: '1px solid rgba(0,0,0,0.1)', flexShrink: 0, opacity: getColorOpacity?.(item) ?? 1 }} />
            <span style={{ color: getDimName?.(item) ? '#999' : 'inherit', fontStyle: getDimName?.(item) ? 'italic' : 'normal' }}>{getLineName(item)}</span>
          </div>
          {right && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
              {right(item)}
            </div>
          )}
        </div>
      ))}
    </>
  );
}

export default DraggableLineList;
