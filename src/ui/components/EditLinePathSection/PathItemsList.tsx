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
      const { isUturn, nodeId, nodeName, exitRoadName, enterRoadName, exitSectionLabel, enterSectionLabel } = entry;
      const item = rscItems[rscCursor++];
      const address: LinePathAddress = { groupIndex: item.groupIndex, stopIndex: item.stopIndex };

      lastAddress = address;

      const roadLineClass = 'overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-neutral-500';

      elements.push(
        <div
          key={`rse-${ei}`}
          className={`my-1 mb-0.5 rounded px-2 py-1.5 ${isUturn ? 'border-l-[3px] border-[#e07800] bg-[#fff8f0]' : 'border-l-[3px] border-[#18a0fb] bg-[#f0f4ff]'}`}
        >
          <div className={roadLineClass}>
            {exitRoadName ?? '—'}{exitSectionLabel && <span className="text-neutral-400"> · {exitSectionLabel}</span>}
          </div>
          <div className="my-0.5 flex items-center gap-2">
            <span className="text-sm">{isUturn ? '↩' : '↪'}</span>
            <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-xs font-medium">
              {isUturn && 'U-turn at '}<strong>{nodeName ?? nodeId}</strong>
            </span>
            {inactive && (
              <>
                <button
                  className="rounded border border-neutral-300 bg-neutral-100 px-2 py-1 text-[10px] font-medium hover:bg-neutral-200"
                  onClick={() => onStartAddingRse(address)}
                  title={`Insert road after this ${isUturn ? 'U-turn' : 'RSC'}`}
                >↪ Road</button>
                <button className="rounded border border-neutral-300 bg-neutral-100 px-2 py-1 text-[10px] font-medium hover:bg-neutral-200" onClick={() => onRemoveRse(item.groupIndex)}>X</button>
              </>
            )}
          </div>
          <div className={roadLineClass}>
            {enterRoadName ?? '—'}{enterSectionLabel && <span className="text-neutral-400"> · {enterSectionLabel}</span>}
          </div>
        </div>
      );
    } else if (entry.kind === 'virtual-uturn') {
      elements.push(
        <div key={`vuturn-${ei}`} className="my-1 mb-0.5 flex items-center gap-2 rounded border-l-[3px] border-[#e07800] bg-[#fff8f0] px-2 py-1.5">
          <span className="text-sm">↩</span>
          <span className="flex-1 text-xs font-medium text-[#e07800]">U-turn</span>
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
            <div key={`stop-${item.flatIndex}`} className="pl-3">
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
            <div key={`grey-${ei}-${s.stationId}`} className="flex items-center gap-2 py-0.5 pr-2 pl-5">
              <span className="flex-1 text-[11px] text-neutral-400 italic">{s.name}</span>
              {inactive && (
                <button
                  className="rounded border border-neutral-300 bg-neutral-100 px-2 py-1 text-[10px] font-medium hover:bg-neutral-200"
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
