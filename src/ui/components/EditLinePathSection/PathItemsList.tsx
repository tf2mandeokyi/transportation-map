import React from 'react';
import { NodeId, StationId } from '@/common/types';
import { DisplayEntry, LinePathData } from '@/common/messages';
import { flattenLinePathData, LinePathAddress, START_ADDRESS } from '../../utils/linePathGroups';
import Button from '../common/Button';
import StationPathItem from './StationPathItem';

interface PathItemsListProps {
  displayEntries: DisplayEntry[];
  linePaths: LinePathData[];
  inactive: boolean;
  onRemoveStop: (groupIndex: number, stopIndex: number) => void;
  onRemoveRse: (groupIndex: number) => void;
  onSelectStation: (stationId: StationId) => void;
  onToggleStops: (groupIndex: number, stopIndex: number, stops: boolean) => void;
  onToggleDirection: (groupIndex: number, stopIndex: number, direction: 'ascending' | 'descending') => void;
  onInsertRoad: (after: LinePathAddress, knownStartNodeId?: NodeId | null, requiredEndNodeId?: NodeId | null) => void;
}

const PathItemsList: React.FC<PathItemsListProps> = ({
  displayEntries, linePaths, inactive,
  onRemoveStop, onRemoveRse, onSelectStation, onToggleStops, onToggleDirection, onInsertRoad,
}) => {
  const elements: React.ReactNode[] = [];
  // Address of the last RSE or real stop emitted so far — an invalid-jump entry
  // sits right after it (that's exactly where the gap in the underlying data
  // is), so "Road" there inserts the missing RSE at that address.
  let lastAddress: LinePathAddress | null = null;

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

  for (let ei = 0; ei < displayEntries.length; ei++) {
    const entry = displayEntries[ei];

    if (entry.kind === 'rse') {
      const { isUturn, nodeId, nodeName, exitRoadName, enterRoadName, exitSectionLabel, enterSectionLabel } = entry;
      const item = rscItems[rscCursor++];
      lastAddress = { groupIndex: item.groupIndex, stopIndex: -1 };

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
              <Button size="sm" onClick={() => onRemoveRse(item.groupIndex)}>X</Button>
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
    } else if (entry.kind === 'invalid-jump') {
      const address = lastAddress ?? START_ADDRESS;
      elements.push(
        <div key={`invalid-jump-${ei}`} className="my-1 mb-0.5 flex items-center gap-2 rounded border-l-[3px] border-red-500 bg-red-50 px-2 py-1.5">
          <span className="text-sm">⚠</span>
          <span className="flex-1 text-xs font-medium text-red-600">Invalid Jump</span>
          {inactive && (
            <Button size="xxs" onClick={() => onInsertRoad(address, entry.fromNodeId, entry.toNodeId)}>↪ Road</Button>
          )}
        </div>
      );
    } else {
      // Traversal: render each station in the order the plugin computed.
      // A station is "real" (backed by an explicit linePaths entry — a checkable
      // pass-through candidate or an actual stop) iff it's next in stopItems order;
      // anything else is a purely visual look-ahead pad (e.g. a virtual U-turn's
      // recede-toward-the-pivot padding) with no linePaths entry to check.
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
                direction={dir}
                onRemove={() => onRemoveStop(groupIndex, stopIndex)}
                onSelect={() => onSelectStation(s.stationId)}
                onToggleStops={stops => onToggleStops(groupIndex, stopIndex, stops)}
                onToggleDirection={() => onToggleDirection(groupIndex, stopIndex, dir === 'ascending' ? 'descending' : 'ascending')}
              />
            </div>
          );
        } else {
          elements.push(
            <div key={`grey-${ei}-${s.stationId}`} className="flex items-center gap-2 py-0.5 pr-2 pl-5">
              <span className="flex-1 text-[11px] text-neutral-400 italic">{s.name}</span>
            </div>
          );
        }
      }
    }
  }

  return <div>{elements}</div>;
};

export default PathItemsList;
