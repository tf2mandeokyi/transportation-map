import React from 'react';
import { NodeId, StationId } from '@/common/types';
import { DisplayEntry } from '@/common/messages';
import Button from '../common/Button';
import StationPathItem from './StationPathItem';

interface PathItemsListProps {
  displayEntries: DisplayEntry[];
  inactive: boolean;
  onRemovePass: (passIndex: number) => void;
  onSelectStation: (stationId: StationId) => void;
  onToggleStops: (passIndex: number, stationId: StationId, stops: boolean) => void;
  onInsertRoad: (boundaryIndex: number, knownStartNodeId?: NodeId | null, requiredEndNodeId?: NodeId | null) => void;
  lineColor?: string;
  // The boundary currently being added to (if any) and the panel to render right
  // after that boundary's row — so the adding UI appears where the insertion is
  // actually happening, rather than always trailing the whole list.
  activeBoundaryIndex?: number | null;
  insertPanel?: React.ReactNode;
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

const RoadInsertButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <Button size="xxs" onClick={onClick}>↪ Road</Button>
);

const PathItemsList: React.FC<PathItemsListProps> = ({
  displayEntries, inactive,
  onRemovePass, onSelectStation, onToggleStops, onInsertRoad,
  lineColor, activeBoundaryIndex = null, insertPanel,
}) => {
  const railColor = lineColor ?? FALLBACK_RAIL_COLOR;
  const elements: React.ReactNode[] = [];

  displayEntries.forEach((entry, ei) => {
    if (entry.kind === 'boundary') {
      const { boundaryIndex, isUturn, nodeId, nodeName, fromRoadName, toRoadName, fromSectionLabel, toSectionLabel } = entry;
      const fromLabel = fromRoadName && (fromSectionLabel ? `${fromRoadName} · ${fromSectionLabel}` : fromRoadName);
      const toLabel = toRoadName && (toSectionLabel ? `${toRoadName} · ${toSectionLabel}` : toRoadName);
      const parts = [fromLabel, <strong key="node">{nodeName ?? nodeId ?? 'Start'}</strong>, toLabel].filter(p => p !== undefined && p !== null && p !== '');

      elements.push(
        <Row key={`boundary-${ei}`} className="my-0.5">
          <div className="flex items-center gap-1 py-0.5">
            <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-xs">
              {isUturn && <span className="text-[#e07800]">U-turn </span>}
              {parts.map((p, i) => <React.Fragment key={i}>{i > 0 && <span className="text-neutral-400"> → </span>}{p}</React.Fragment>)}
            </span>
            {inactive && (
              // At the very front of a non-empty path (boundaryIndex 0), there's no
              // fromPass to already anchor the new chain's start — nodeId is instead
              // where the chain must end up, to reconnect with the existing first pass.
              <RoadInsertButton onClick={() => boundaryIndex === 0
                ? onInsertRoad(boundaryIndex, null, nodeId)
                : onInsertRoad(boundaryIndex, nodeId)}
              />
            )}
          </div>
        </Row>
      );
      if (boundaryIndex === activeBoundaryIndex && insertPanel) elements.push(<React.Fragment key={`insert-${ei}`}>{insertPanel}</React.Fragment>);
    } else if (entry.kind === 'invalid-jump') {
      elements.push(
        <Row key={`invalid-jump-${ei}`} marker={<span className="text-red-500">⚠</span>}>
          <div className="flex items-center gap-2">
            <span className="flex-1 text-xs font-medium text-red-600">Invalid Jump</span>
            {inactive && (
              <RoadInsertButton onClick={() => onInsertRoad(entry.boundaryIndex, entry.fromNodeId, entry.toNodeId)} />
            )}
          </div>
        </Row>
      );
      if (entry.boundaryIndex === activeBoundaryIndex && insertPanel) elements.push(<React.Fragment key={`insert-${ei}`}>{insertPanel}</React.Fragment>);
    } else {
      // Traversal: render each station in the order the plugin computed. Every
      // station self-describes its own address (passIndex + stationId) and whether
      // it's a real stop or a pass-through candidate — no cursor-matching needed.
      // The road section itself (not any single station) gets one remove button.
      // The station rows sit in their own column (so every row is the same width,
      // regardless of which one the button lines up with) and the button sits in a
      // second column next to it, centered by the group's own flex layout — no need
      // to pick out a "center" row.
      elements.push(
        <div key={`section-${entry.passIndex}`} className="flex items-center gap-1.5">
          <div className="min-w-0 flex-1">
            {entry.stations.map(s => (
              <Row key={`stop-${s.passIndex}-${s.stationId}`} marker={<span className="h-3 w-3 rounded-full border-2 bg-white" style={{ borderColor: railColor }} />}>
                <StationPathItem
                  name={s.name}
                  stops={s.stops}
                  onSelect={() => onSelectStation(s.stationId)}
                  onToggleStops={stops => onToggleStops(s.passIndex, s.stationId, stops)}
                />
              </Row>
            ))}
          </div>
          {inactive && (
            <Button size="sm" onClick={() => onRemovePass(entry.passIndex)}>X</Button>
          )}
        </div>
      );
    }
  });

  return (
    <div className="relative">
      <div className={`pointer-events-none absolute top-1 bottom-1 ${RAIL_LINE_LEFT} border-l-2`} style={{ borderColor: railColor }} />
      {elements}
    </div>
  );
};

export default PathItemsList;
