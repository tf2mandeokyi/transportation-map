import React from 'react';
import { StationId } from '@/common/types';
import { RoadData } from '@/common/messages';
import { LinePath } from '@/plugin/models/structures';
import StationPathItem from './StationPathItem';
import InsertionButtons from './InsertionButtons';

interface PathItemsListProps {
  linePaths: LinePath[];
  stationNames: Record<string, string>;
  roads: RoadData[];
  inactive: boolean;
  onRemoveStop: (pathIndex: number) => void;
  onRemoveRse: (pathIndex: number) => void;
  onSelectStation: (stationId: StationId) => void;
  onToggleStops: (pathIndex: number, stops: boolean) => void;
  onStartAddingStation: (afterPathIndex: number) => void;
  onStartAddingRse: (afterPathIndex: number) => void;
}

const PathItemsList: React.FC<PathItemsListProps> = ({
  linePaths, stationNames, roads, inactive,
  onRemoveStop, onRemoveRse, onSelectStation, onToggleStops,
  onStartAddingStation, onStartAddingRse,
}) => {
  const elements: React.ReactNode[] = [];
  const hasStopAfter = (i: number) => linePaths.slice(i + 1).some(p => p.kind === 'station-stop');

  const maybeInsertionButtons = (afterPathIndex: number) => {
    if (!inactive) return;
    const isBeforeAll = afterPathIndex === -1;
    const nextPath = isBeforeAll ? linePaths[0] : linePaths[afterPathIndex + 1];
    const showStation = isBeforeAll || !nextPath || nextPath.kind === 'station-stop';
    const showRse = !isBeforeAll && hasStopAfter(afterPathIndex);
    elements.push(
      <InsertionButtons
        key={`insert-${afterPathIndex}`}
        onAddStation={showStation ? () => onStartAddingStation(afterPathIndex) : undefined}
        onAddRse={showRse ? () => onStartAddingRse(afterPathIndex) : undefined}
      />
    );
  };

  maybeInsertionButtons(-1);

  for (let i = 0; i < linePaths.length; i++) {
    const path = linePaths[i];

    if (path.kind === 'station-stop') {
      elements.push(
        <StationPathItem
          key={`stop-${i}`}
          name={stationNames[path.station.id] ?? path.station.id}
          index={i}
          stops={path.stops}
          onRemove={() => onRemoveStop(path.index)}
          onSelect={() => onSelectStation(path.station.id)}
          onToggleStops={stops => onToggleStops(path.index, stops)}
        />
      );
    } else {
      const enteringId = path.entering?.id ?? null;
      const enteringRoad = enteringId ? roads.find(r => r.sections.some(s => s.id === enteringId)) : null;
      elements.push(
        <div key={`rse-${i}`} className="station-path-item" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="station-number" style={{ paddingLeft: '4px', paddingRight: '4px' }}>{i + 1}</span>
          <span style={{ flex: 1, fontStyle: 'italic', color: '#666' }}>↪ {enteringRoad?.name ?? (enteringId ?? '?')}</span>
          {inactive && (
            <button className="button button--secondary small-btn" onClick={() => onRemoveRse(i)}>X</button>
          )}
        </div>
      );
    }

    maybeInsertionButtons(i);
  }

  return <div>{elements}</div>;
};

export default PathItemsList;
