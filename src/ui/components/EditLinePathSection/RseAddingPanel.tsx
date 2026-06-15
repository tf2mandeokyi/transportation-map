import React from 'react';
import { NodeId, RoadId } from '@/common/types';

interface RseAddingPanelProps {
  rseError: string | null;
  rseNodeOptions: Array<{ nodeId: NodeId; nodeName: string }> | null;
  rsePendingRoadId: RoadId | null;
  rseSelectedNodeId: NodeId | '';
  onNodeSelect: (id: NodeId | '') => void;
  onCommit: () => void;
  onCancel: () => void;
}

const RseAddingPanel: React.FC<RseAddingPanelProps> = ({
  rseError, rseNodeOptions, rsePendingRoadId, rseSelectedNodeId,
  onNodeSelect, onCommit, onCancel,
}) => (
  <div style={{ padding: '12px', background: '#f5f5f5', borderRadius: '4px', border: '2px solid #18a0fb', marginTop: '8px' }}>
    <p style={{ fontSize: '11px', color: '#666', margin: '0 0 8px 0' }}>
      <strong>Adding road enter</strong><br />
      Click a road section on the canvas to enter from that road.
    </p>
    {rseError && (
      <p style={{ fontSize: '11px', color: '#c00', margin: '0 0 8px 0' }}>{rseError}</p>
    )}
    {rseNodeOptions && rsePendingRoadId && (
      <div style={{ marginBottom: '8px' }}>
        <p style={{ fontSize: '11px', color: '#333', margin: '0 0 4px 0' }}>Multiple junctions — pick one:</p>
        <select
          className="input"
          value={rseSelectedNodeId}
          onChange={e => onNodeSelect(e.target.value as NodeId)}
          style={{ fontSize: '11px', width: '100%', marginBottom: '6px' }}
        >
          <option value="">-- select junction --</option>
          {rseNodeOptions.map(opt => (
            <option key={opt.nodeId} value={opt.nodeId}>{opt.nodeName}</option>
          ))}
        </select>
        <button
          className="button button--primary"
          disabled={!rseSelectedNodeId}
          style={{ width: '100%', marginBottom: '4px' }}
          onClick={onCommit}
        >
          Add Road Enter
        </button>
      </div>
    )}
    <button className="button button--secondary" style={{ width: '100%' }} onClick={onCancel}>Cancel</button>
  </div>
);

export default RseAddingPanel;
