import React from 'react';
import { StationId } from '@/common/types';
import { DisplayEntry, LinePathData } from '@/common/messages';
import { LinePathAddress, START_ADDRESS, flattenLinePathData } from '../../utils/linePathGroups';
import StationPathItem from './StationPathItem';

interface PathItemsListProps {
  displayEntries: DisplayEntry[];
  linePaths: LinePathData[];
  inactive: boolean;
  onRemoveStop: (groupIndex: number, stopIndex: number) => void;
  onRemoveRse: (groupIndex: number) => void;
  onSelectStation: (stationId: StationId) => void;
  onToggleStops: (groupIndex: number, stopIndex: number, stops: boolean) => void;
  onAddSectionStation: (stationId: StationId, after: LinePathAddress, direction: 'ascending' | 'descending') => void;
  onStartAddingRse: (after: LinePathAddress) => void;
}

const PathItemsList: React.FC<PathItemsListProps> = ({
  displayEntries, linePaths, inactive,
  onRemoveStop, onRemoveRse, onSelectStation, onToggleStops,
  onAddSectionStation, onStartAddingRse,
}) => {
  const elements: React.ReactNode[] = [];

  // linePaths is the grouped path list backing displayEntries. Flattening it
  // recovers the same ordered sequence as before grouping — both the 'rse'
  // entries and the real (non-greyed) traversal stops appear in displayEntries
  // in that same relative order, so a single walk in lockstep recovers each
  // one's (groupIndex, stopIndex) address.
  const flat = flattenLinePathData(linePaths);
  const rscItems = flat.filter(item => item.kind === 'rsc');
  const stopItems = flat.filter(item => item.kind === 'station-stop');
  let rscCursor = 0;
  let stopCursor = 0;

  // lastAddress: updated by both in-path stations AND RSC entries.
  // Used as insertAfter for grey station "+" buttons so that post-U-turn grey
  // stations (which appear before the first in-path station in display order)
  // correctly insert after the U-turn RSC, not before it.
  let lastAddress: LinePathAddress = START_ADDRESS;

  for (let ei = 0; ei < displayEntries.length; ei++) {
    const entry = displayEntries[ei];

    if (entry.kind === 'rse') {
      const { isUturn, nodeId, nodeName, exitRoadName, enterRoadName } = entry;
      const item = rscItems[rscCursor++];
      const address: LinePathAddress = { groupIndex: item.groupIndex, stopIndex: item.stopIndex };

      lastAddress = address;

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
            {inactive && <button className="button button--secondary small-btn" onClick={() => onRemoveRse(item.groupIndex)}>X</button>}
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
            {inactive && <button className="button button--secondary small-btn" onClick={() => onRemoveRse(item.groupIndex)}>X</button>}
          </div>
        );
      }

      // ↪ Road insertion button after each RSC/U-turn
      if (inactive) {
        elements.push(
          <div key={`rse-btn-after-${ei}`} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '2px 0' }}>
            <div style={{ flex: 1, height: '1px', background: '#d0d0d0' }} />
            <button
              className="button button--secondary"
              style={{ fontSize: '10px', padding: '2px 6px', lineHeight: '14px' }}
              onClick={() => onStartAddingRse(address)}
            >↪ Road</button>
            <div style={{ flex: 1, height: '1px', background: '#d0d0d0' }} />
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
      // Traversal: render each station in the order the plugin computed.
      // A station is "real" (backed by an explicit linePaths entry, stopping or
      // not) iff it's next in stopItems order; anything else is a synthesized
      // greyed pass-through with no linePaths entry at all.
      const dir = entry.direction;
      for (const s of entry.stations) {
        const nextItem = stopCursor < stopItems.length ? stopItems[stopCursor] : undefined;
        const isReal = nextItem?.stop?.stationId === s.stationId;

        if (isReal) {
          const item = stopItems[stopCursor++];
          const { groupIndex, stopIndex } = item;
          lastAddress = { groupIndex, stopIndex };
          elements.push(
            <div key={`stop-${item.flatIndex}`} style={{ paddingLeft: '12px' }}>
              <StationPathItem
                name={s.name}
                index={item.flatIndex}
                stops={s.stops}
                onRemove={() => onRemoveStop(groupIndex, stopIndex)}
                onSelect={() => onSelectStation(s.stationId)}
                onToggleStops={stops => onToggleStops(groupIndex, stopIndex, stops)}
              />
            </div>
          );
        } else {
          const insertAfter = lastAddress;
          elements.push(
            <div key={`grey-${ei}-${s.stationId}`} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '2px 8px 2px 20px' }}>
              <span style={{ flex: 1, fontSize: '11px', color: '#aaa', fontStyle: 'italic' }}>{s.name}</span>
              {inactive && (
                <button
                  className="button button--secondary small-btn"
                  onClick={() => onAddSectionStation(s.stationId, insertAfter, dir)}
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
