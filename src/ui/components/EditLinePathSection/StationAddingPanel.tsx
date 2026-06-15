import React from 'react';
import { StationId } from '@/common/types';

interface StationAddingPanelProps {
  pendingStations: Array<{ id: StationId; name: string }>;
  onFinish: () => void;
  onCancel: () => void;
}

const StationAddingPanel: React.FC<StationAddingPanelProps> = ({ pendingStations, onFinish, onCancel }) => (
  <div style={{ padding: '12px', background: '#f5f5f5', borderRadius: '4px', border: '2px solid #18a0fb', marginTop: '8px' }}>
    <p style={{ fontSize: '11px', color: '#666', margin: '0 0 8px 0' }}>
      <strong>Adding stations mode</strong><br />
      Click stations on the canvas to add them to the path.
    </p>
    {pendingStations.length > 0 && (
      <div style={{ marginBottom: '8px' }}>
        {pendingStations.map((s, i) => (
          <div key={`${s.id}-${i}`} style={{ fontSize: '11px', padding: '2px 0' }}>{i + 1}. {s.name}</div>
        ))}
      </div>
    )}
    <div className="two-column">
      <button className="button button--primary" onClick={onFinish} disabled={pendingStations.length === 0}>Finish</button>
      <button className="button button--secondary" onClick={onCancel}>Cancel</button>
    </div>
  </div>
);

export default StationAddingPanel;
