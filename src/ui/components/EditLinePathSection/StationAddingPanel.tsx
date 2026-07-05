import React, { useEffect, useRef, useState } from 'react';
import { RoadId, StationId } from '@/common/types';
import { useMessageManager } from '../../contexts/MessageContext';

interface StationAddingPanelProps {
  currentRoadId: RoadId | null;
  stationRoadIds: Record<string, RoadId | null>;
  onFinish: (stations: Array<{ id: StationId; name: string }>) => void;
  onCancel: () => void;
  onSwitchToRse?: () => void;
}

const StationAddingPanel: React.FC<StationAddingPanelProps> = ({
  currentRoadId,
  stationRoadIds,
  onFinish,
  onCancel,
  onSwitchToRse,
}) => {
  const manager = useMessageManager();
  const [pendingStations, setPendingStations] = useState<Array<{ id: StationId; name: string }>>([]);
  const pendingRef = useRef(pendingStations);
  useEffect(() => { pendingRef.current = pendingStations; }, [pendingStations]);

  useEffect(() => {
    return manager.onMessage('station-clicked', msg => {
      const stationRoadId = stationRoadIds[msg.stationId] ?? null;
      if (currentRoadId !== null && stationRoadId !== currentRoadId) {
        onSwitchToRse?.();
        return;
      }
      setPendingStations(prev => [...prev, { id: msg.stationId, name: msg.station.name }]);
    });
  }, [manager, currentRoadId, stationRoadIds]);

  return (
    <div className="mt-2 rounded border-2 border-[#18a0fb] bg-neutral-100 p-3">
      <p className="mb-2 text-[11px] text-neutral-500">
        <strong>Adding stations mode</strong><br />
        Click stations on the canvas to add them to the path.
      </p>
      {pendingStations.length > 0 && (
        <div className="mb-2">
          {pendingStations.map((s, i) => (
            <div key={`${s.id}-${i}`} className="py-0.5 text-[11px]">{i + 1}. {s.name}</div>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <button className="rounded bg-[#18a0fb] px-3 py-2 font-medium text-white hover:bg-[#0d8ee0] disabled:cursor-not-allowed disabled:opacity-50" onClick={() => onFinish(pendingRef.current)} disabled={pendingStations.length === 0}>Finish</button>
        <button className="rounded border border-neutral-300 bg-neutral-100 px-3 py-2 font-medium hover:bg-neutral-200" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
};

export default StationAddingPanel;
