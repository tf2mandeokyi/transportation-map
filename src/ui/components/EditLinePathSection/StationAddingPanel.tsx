import React, { useEffect, useRef, useState } from 'react';
import { RoadId, StationId } from '@/common/types';
import { useMessageManager } from '../../contexts/MessageContext';

interface StationAddingPanelProps {
  currentRoadId: RoadId | null;
  stationRoadIds: Record<string, RoadId | null>;
  onFinish: (stations: Array<{ id: StationId; name: string }>) => void;
  onCancel: () => void;
}

const StationAddingPanel: React.FC<StationAddingPanelProps> = ({
  currentRoadId,
  stationRoadIds,
  onFinish,
  onCancel,
}) => {
  const manager = useMessageManager();
  const [pendingStations, setPendingStations] = useState<Array<{ id: StationId; name: string }>>([]);
  const [error, setError] = useState<string | null>(null);

  const pendingRef = useRef(pendingStations);
  useEffect(() => { pendingRef.current = pendingStations; }, [pendingStations]);

  useEffect(() => {
    return manager.onMessage('station-clicked', msg => {
      const stationRoadId = stationRoadIds[msg.stationId] ?? null;
      if (currentRoadId !== null && stationRoadId !== currentRoadId) {
        setError(`"${msg.station.name}" is on a different road. Add a road section entry first.`);
        return;
      }
      setError(null);
      setPendingStations(prev => [...prev, { id: msg.stationId, name: msg.station.name }]);
    });
  }, [manager, currentRoadId, stationRoadIds]);

  return (
    <div style={{ padding: '12px', background: '#f5f5f5', borderRadius: '4px', border: '2px solid #18a0fb', marginTop: '8px' }}>
      <p style={{ fontSize: '11px', color: '#666', margin: '0 0 8px 0' }}>
        <strong>Adding stations mode</strong><br />
        Click stations on the canvas to add them to the path.
      </p>
      {error && (
        <div style={{ fontSize: '11px', color: '#c00', background: '#fff0f0', border: '1px solid #f00', borderRadius: '3px', padding: '6px 8px', marginBottom: '8px' }}>
          {error}
        </div>
      )}
      {pendingStations.length > 0 && (
        <div style={{ marginBottom: '8px' }}>
          {pendingStations.map((s, i) => (
            <div key={`${s.id}-${i}`} style={{ fontSize: '11px', padding: '2px 0' }}>{i + 1}. {s.name}</div>
          ))}
        </div>
      )}
      <div className="two-column">
        <button className="button button--primary" onClick={() => onFinish(pendingRef.current)} disabled={pendingStations.length === 0}>Finish</button>
        <button className="button button--secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
};

export default StationAddingPanel;
