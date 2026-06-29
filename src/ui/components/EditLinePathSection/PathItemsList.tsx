import React from 'react';
import { StationId } from '@/common/types';
import { DisplayEntry } from '@/common/messages';
import StationPathItem from './StationPathItem';

interface PathItemsListProps {
  displayEntries: DisplayEntry[];
  inactive: boolean;
  onRemoveStop: (pathIndex: number) => void;
  onRemoveRse: (pathIndex: number) => void;
  onSelectStation: (stationId: StationId) => void;
  onToggleStops: (pathIndex: number, stops: boolean) => void;
  onAddSectionStation: (stationId: StationId, afterPathIndex: number) => void;
  onStartAddingRse: (afterPathIndex: number) => void;
}

const PathItemsList: React.FC<PathItemsListProps> = ({
  displayEntries, inactive,
  onRemoveStop, onRemoveRse, onSelectStation, onToggleStops,
  onAddSectionStation, onStartAddingRse,
}) => {
  const elements: React.ReactNode[] = [];

  // Track the last in-path pathIndex seen so far — used to compute insertion point
  // for greyed-out station "+" buttons and for the ↪ Road button.
  let lastInPathIdx = -1;

  for (let ei = 0; ei < displayEntries.length; ei++) {
    const entry = displayEntries[ei];

    if (entry.kind === 'rse') {
      const { isUturn, nodeId, nodeName, exitRoadName, enterRoadName } = entry;

      // ↪ Road insertion button before this RSE (uses last in-path position)
      if (inactive) {
        const afterIdx = lastInPathIdx;
        // Only show if there is at least one traversal with in-path stops after this point
        const hasStopAfter = displayEntries.slice(ei).some(
          e => e.kind === 'traversal' && e.stations.some(s => s.inPath)
        );
        if (hasStopAfter) {
          elements.push(
            <div key={`rse-btn-${ei}`} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '2px 0' }}>
              <div style={{ flex: 1, height: '1px', background: '#d0d0d0' }} />
              <button
                className="button button--secondary"
                style={{ fontSize: '10px', padding: '2px 6px', lineHeight: '14px' }}
                onClick={() => onStartAddingRse(afterIdx)}
              >↪ Road</button>
              <div style={{ flex: 1, height: '1px', background: '#d0d0d0' }} />
            </div>
          );
        }
      }

      if (isUturn) {
        elements.push(
          <div key={`rse-${ei}`} style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '5px 8px', background: '#fff8f0',
            borderRadius: '4px', borderLeft: '3px solid #e07800',
            margin: '4px 0 2px',
          }}>
            <span style={{ fontSize: '14px' }}>↩</span>
            <span style={{ flex: 1, fontSize: '12px', fontWeight: 500, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
              U-turn at <strong>{nodeName ?? nodeId}</strong>
              {exitRoadName && <span style={{ fontWeight: 400, color: '#888' }}> — {exitRoadName}</span>}
            </span>
            {inactive && <button className="button button--secondary small-btn" onClick={() => onRemoveRse(entry.pathIndex)}>X</button>}
          </div>
        );
      } else {
        elements.push(
          <div key={`rse-${ei}`} style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '5px 8px', background: '#f0f4ff',
            borderRadius: '4px', borderLeft: '3px solid #18a0fb',
            margin: '4px 0 2px',
          }}>
            <span style={{ fontSize: '14px' }}>↪</span>
            <span style={{ flex: 1, fontSize: '12px', fontWeight: 500, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
              <span style={{ color: '#777', fontWeight: 400 }}>{exitRoadName ?? '—'}</span>
              {' → '}
              <strong>{nodeName ?? nodeId}</strong>
              {' → '}
              <span style={{ color: '#444' }}>{enterRoadName ?? '—'}</span>
            </span>
            {inactive && <button className="button button--secondary small-btn" onClick={() => onRemoveRse(entry.pathIndex)}>X</button>}
          </div>
        );
      }
    } else if (entry.kind === 'virtual-uturn') {
      elements.push(
        <div key={`vuturn-${ei}`} style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '5px 8px', background: '#fff8f0',
          borderRadius: '4px', borderLeft: '3px solid #e07800',
          margin: '4px 0 2px',
        }}>
          <span style={{ fontSize: '14px' }}>↩</span>
          <span style={{ flex: 1, fontSize: '12px', fontWeight: 500, color: '#e07800' }}>U-turn</span>
        </div>
      );
    } else {
      // Traversal: render each station in the order the plugin computed
      for (const s of entry.stations) {
        if (s.inPath) {
          lastInPathIdx = s.pathIndex;
          elements.push(
            <div key={`stop-${s.pathIndex}`} style={{ paddingLeft: '12px' }}>
              <StationPathItem
                name={s.name}
                index={s.pathIndex}
                stops={s.stops}
                onRemove={() => onRemoveStop(s.pathIndex)}
                onSelect={() => onSelectStation(s.stationId)}
                onToggleStops={stops => onToggleStops(s.pathIndex, stops)}
              />
            </div>
          );
        } else {
          const insertAfter = lastInPathIdx;
          elements.push(
            <div key={`grey-${ei}-${s.stationId}`} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '2px 8px 2px 20px' }}>
              <span style={{ flex: 1, fontSize: '11px', color: '#aaa', fontStyle: 'italic' }}>{s.name}</span>
              {inactive && (
                <button
                  className="button button--secondary small-btn"
                  onClick={() => onAddSectionStation(s.stationId, insertAfter)}
                  title="Add to path"
                >+</button>
              )}
            </div>
          );
        }
      }
    }
  }

  return <div>{elements}</div>;
};

export default PathItemsList;
