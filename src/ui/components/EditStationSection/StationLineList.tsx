import React, { useEffect } from 'react';
import { LineAtStationData } from '@/common/messages';
import { StationId } from '@/common/types';
import { postMessageToPlugin } from '../../figma';
import Button from '../common/Button';
import ConfirmButton from '../common/ConfirmButton';
import DraggableLineList from '../DraggableLineList';
import { useStagedOrder } from '../common/useStagedOrder';

interface Props {
  stationId: StationId;
  lines: LineAtStationData[];
  // Reported on every dirty/clean transition so the surrounding Edit Station panel's
  // Close/switch-station guard also catches an unapplied reorder, not just unapplied
  // form fields.
  onDirtyChange: (dirty: boolean) => void;
}

const lineKey = (l: LineAtStationData) => `${l.id}-${l.passIndex}`;

const StationLineList: React.FC<Props> = ({ stationId, lines, onDirtyChange }) => {
  const { order, setOrder, isDirty, cancel } = useStagedOrder(lines, lineKey);

  useEffect(() => { onDirtyChange(isDirty); }, [isDirty, onDirtyChange]);

  const handleApply = () => {
    const stops = order.map((l, i) => ({ lineId: l.id, passIndex: l.passIndex, rank: i }));
    postMessageToPlugin({ type: 'patch-station', stationId, patch: { op: 'update-stop-ranks', stops } });
  };

  return (
    <div>
      <label className="mb-1 block font-medium select-none">Lines at this station (drag to reorder)</label>
      <div className="mt-2 max-h-[200px] overflow-y-auto">
        <DraggableLineList
          items={order}
          getKey={lineKey}
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
          onCommit={setOrder}
        />
      </div>
      {isDirty && (
        <div className="mt-1 grid grid-cols-2 gap-2">
          <Button size="sm" variant="primary" onClick={handleApply}>Apply Order</Button>
          <ConfirmButton size="sm" label="Cancel" onConfirm={cancel} prompt="Discard reorder?" confirmLabel="Discard" keepLabel="Keep" />
        </div>
      )}
    </div>
  );
};

export default StationLineList;
