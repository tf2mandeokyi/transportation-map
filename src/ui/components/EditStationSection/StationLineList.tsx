import React from 'react';
import { LineAtStationData } from '@/common/messages';
import { StationId } from '@/common/types';
import { postMessageToPlugin } from '../../figma';
import DraggableLineList from '../DraggableLineList';

interface Props {
  stationId: StationId;
  lines: LineAtStationData[];
}

const StationLineList: React.FC<Props> = ({ stationId, lines }) => (
  <div>
    <label>Lines at this station (drag to reorder)</label>
    <div style={{ maxHeight: '200px', overflowY: 'auto', marginTop: '8px' }}>
      <DraggableLineList
        items={lines}
        getKey={l => `${l.id}-${l.pathIndex}-${l.departureRole ? 'dep' : 'arr'}`}
        getLineColor={l => l.color}
        getLineName={l => l.name}
        getColorOpacity={l => l.stops ? 1 : 0.5}
        getDimName={l => !l.stops}
        right={l => (
          <>
            <span style={{ color: '#999', fontSize: '12px' }}>
              {l.facing === 'right' ? '→' : '←'}
            </span>
            {!l.departureRole && (
              <input
                type="checkbox"
                checked={l.stops}
                title={l.stops ? 'Stops here' : 'Passes through'}
                onChange={e => {
                  postMessageToPlugin({ type: 'patch-line', lineId: l.id, patch: { op: 'toggle-stops', pathIndex: l.pathIndex, stops: e.target.checked } });
                  postMessageToPlugin({ type: 'get-station-info', stationId });
                }}
              />
            )}
          </>
        )}
        onCommit={items => {
          const stops = items
            .filter(l => !l.departureRole)
            .map((l, i) => ({ lineId: l.id, pathIndex: l.pathIndex, rank: i }));
          postMessageToPlugin({ type: 'patch-station', stationId, patch: { op: 'update-stop-ranks', stops } });
        }}
      />
    </div>
  </div>
);

export default StationLineList;
