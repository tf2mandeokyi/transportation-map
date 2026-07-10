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
    <label className="mb-1 block font-medium select-none">Lines at this station (drag to reorder)</label>
    <div className="mt-2 max-h-[200px] overflow-y-auto">
      <DraggableLineList
        items={lines}
        getKey={l => `${l.id}-${l.passIndex}`}
        getLineColor={l => l.color}
        getLineName={l => l.name}
        getColorOpacity={l => l.stops ? 1 : 0.5}
        getDimName={l => !l.stops}
        showRank
        getRank={l => l.rank}
        right={l => (
          <>
            <span className="text-xs text-neutral-400">
              {l.facing === 'right' ? '→' : '←'}
            </span>
            <input
              type="checkbox"
              checked={l.stops}
              title={l.stops ? 'Stops here' : 'Passes through'}
              onChange={e => {
                postMessageToPlugin({ type: 'patch-line', lineId: l.id, patch: { op: 'toggle-stops', passIndex: l.passIndex, stationId, stops: e.target.checked } });
                postMessageToPlugin({ type: 'get-station-info', stationId });
              }}
            />
          </>
        )}
        onCommit={items => {
          const stops = items.map((l, i) => ({ lineId: l.id, passIndex: l.passIndex, rank: i }));
          postMessageToPlugin({ type: 'patch-station', stationId, patch: { op: 'update-stop-ranks', stops } });
        }}
      />
    </div>
  </div>
);

export default StationLineList;
