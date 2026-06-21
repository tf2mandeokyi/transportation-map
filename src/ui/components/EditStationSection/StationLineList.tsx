import React, { useEffect, useRef } from 'react';
import { LineAtStationData } from '@/common/messages';
import { StationId } from '@/common/types';
import { postMessageToPlugin } from '../../figma';

interface Props {
  stationId: StationId;
  lines: LineAtStationData[];
  onReorder: (next: LineAtStationData[]) => void;
}

const StationLineList: React.FC<Props> = ({ stationId, lines, onReorder }) => {
  const stationIdRef = useRef(stationId);
  useEffect(() => { stationIdRef.current = stationId; }, [stationId]);

  // Kept as a ref so drag handlers always read the latest order without
  // waiting for a re-render cycle between rapid onDragOver firings.
  const linesRef = useRef(lines);
  useEffect(() => { linesRef.current = lines; }, [lines]);

  const draggedIndexRef = useRef<number | null>(null);

  if (lines.length === 0) return null;

  return (
    <div>
      <label>Lines at this station (drag to reorder)</label>
      <div style={{ maxHeight: '200px', overflowY: 'auto', marginTop: '8px' }}>
        {lines.map((lineInfo, index) => {
          const isDep = lineInfo.departureRole === true;
          return (
            <div
              key={`${lineInfo.id}-${lineInfo.pathIndex}-${isDep ? 'dep' : 'arr'}`}
              className="station-path-item"
              draggable={true}
              onDragStart={() => { draggedIndexRef.current = index; }}
              onDragEnd={() => {
                draggedIndexRef.current = null;
                const stops = linesRef.current
                  .filter(l => !l.departureRole)
                  .map((l, i) => ({ lineId: l.id, pathIndex: l.pathIndex, rank: i }));
                postMessageToPlugin({ type: 'patch-station', stationId: stationIdRef.current, patch: { op: 'update-stop-ranks', stops } });
              }}
              onDragOver={(e) => {
                e.preventDefault();
                const dragIdx = draggedIndexRef.current;
                if (dragIdx === null || dragIdx === index) return;
                const next = [...linesRef.current];
                const [moved] = next.splice(dragIdx, 1);
                next.splice(index, 0, moved);
                draggedIndexRef.current = index;
                linesRef.current = next;
                onReorder(next);
              }}
              onDrop={(e) => { e.preventDefault(); }}
              style={{ alignItems: 'center', cursor: 'grab' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                <span style={{ color: '#999', fontSize: '12px' }}>⋮⋮</span>
                <div style={{ width: '12px', height: '12px', backgroundColor: lineInfo.color, borderRadius: '2px', border: '1px solid rgba(0,0,0,0.1)', flexShrink: 0, opacity: lineInfo.stops ? 1 : 0.5 }} />
                <span style={{ color: lineInfo.stops ? 'inherit' : '#999', fontStyle: lineInfo.stops ? 'normal' : 'italic' }}>{lineInfo.name}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                <span style={{ color: '#999', fontSize: '12px' }}>
                  {lineInfo.facing === 'right' ? '→' : '←'}
                </span>
                {!isDep && (
                  <input
                    type="checkbox"
                    checked={lineInfo.stops}
                    title={lineInfo.stops ? 'Stops here' : 'Passes through'}
                    onChange={(e) => {
                      postMessageToPlugin({ type: 'patch-line', lineId: lineInfo.id, patch: { op: 'toggle-stops', pathIndex: lineInfo.pathIndex, stops: e.target.checked } });
                      postMessageToPlugin({ type: 'get-station-info', stationId: stationIdRef.current });
                    }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default StationLineList;
