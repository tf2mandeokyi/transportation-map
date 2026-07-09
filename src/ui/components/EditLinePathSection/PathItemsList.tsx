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
  lineColor?: string;
}

// Rail column: a marker sits over a continuous vertical line so the list reads
// as a timeline — circles for station stops, with plain "|" runs for road-section entries.
// Line and circle stroke share the line's own color so changing it changes both.
const FALLBACK_RAIL_COLOR = '#a3a3a3';
const RAIL_WIDTH = 'w-5';
const RAIL_LINE_LEFT = 'left-[9px]';

const Row: React.FC<{ marker?: React.ReactNode; children: React.ReactNode; className?: string }> = ({ marker, children, className }) => (
  <div className={`relative z-10 flex items-center gap-1.5 ${className ?? ''}`}>
    <div className={`flex ${RAIL_WIDTH} shrink-0 justify-center text-xs leading-none`}>{marker}</div>
    <div className="min-w-0 flex-1">{children}</div>
  </div>
);

const PathItemsList: React.FC<PathItemsListProps> = ({
  displayEntries, linePaths, inactive,
  onRemoveStop, onRemoveRse, onSelectStation, onToggleStops, onToggleDirection, onInsertRoad,
  lineColor,
}) => {
  const railColor = lineColor ?? FALLBACK_RAIL_COLOR;
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

      const exitLabel = exitRoadName && (exitSectionLabel ? `${exitRoadName} · ${exitSectionLabel}` : exitRoadName);
      const enterLabel = enterRoadName && (enterSectionLabel ? `${enterRoadName} · ${enterSectionLabel}` : enterRoadName);
      const parts = [exitLabel, <strong key="node">{nodeName ?? nodeId}</strong>, enterLabel].filter(p => p !== undefined && p !== null && p !== '');

      elements.push(
        <Row key={`rse-${ei}`} className="my-0.5">
          <div className="flex items-center gap-1 py-0.5">
            <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-xs">
              {isUturn && <span className="text-[#e07800]">U-turn </span>}
              {parts.map((p, i) => <React.Fragment key={i}>{i > 0 && <span className="text-neutral-400"> → </span>}{p}</React.Fragment>)}
            </span>
            {inactive && (
              <Button size="sm" onClick={() => onRemoveRse(item.groupIndex)}>X</Button>
            )}
          </div>
        </Row>
      );
    } else if (entry.kind === 'virtual-uturn') {
      elements.push(
        <Row key={`vuturn-${ei}`} marker={<span className="text-[#e07800]">↩</span>}>
          <span className="text-xs font-medium text-[#e07800]">U-turn</span>
        </Row>
      );
    } else if (entry.kind === 'invalid-jump') {
      const address = lastAddress ?? START_ADDRESS;
      elements.push(
        <Row key={`invalid-jump-${ei}`} marker={<span className="text-red-500">⚠</span>}>
          <div className="flex items-center gap-2">
            <span className="flex-1 text-xs font-medium text-red-600">Invalid Jump</span>
            {inactive && (
              <Button size="xxs" onClick={() => onInsertRoad(address, entry.fromNodeId, entry.toNodeId)}>↪ Road</Button>
            )}
          </div>
        </Row>
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
            <Row key={`stop-${item.flatIndex}`} marker={<span className="h-3 w-3 rounded-full border-2 bg-white" style={{ borderColor: railColor }} />}>
              <StationPathItem
                name={s.name}
                stops={s.stops}
                direction={dir}
                onRemove={() => onRemoveStop(groupIndex, stopIndex)}
                onSelect={() => onSelectStation(s.stationId)}
                onToggleStops={stops => onToggleStops(groupIndex, stopIndex, stops)}
                onToggleDirection={() => onToggleDirection(groupIndex, stopIndex, dir === 'ascending' ? 'descending' : 'ascending')}
              />
            </Row>
          );
        } else {
          elements.push(
            <Row key={`grey-${ei}-${s.stationId}`} marker={<span className="h-3 w-3 rounded-full border-2 border-neutral-300 bg-white" />}>
              <span className="text-[11px] text-neutral-400 italic">{s.name}</span>
            </Row>
          );
        }
      }
    }
  }

  return (
    <div className="relative">
      <div className={`pointer-events-none absolute top-1 bottom-1 ${RAIL_LINE_LEFT} border-l-2`} style={{ borderColor: railColor }} />
      {elements}
    </div>
  );
};

export default PathItemsList;
