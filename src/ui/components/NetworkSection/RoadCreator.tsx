import React from 'react';
import { useNetworkContext } from '../../contexts/NetworkContext';

const RoadCreator: React.FC = () => {
  const { isAddingRoad, roadSnapState, handleStartRoadCreation, handleConfirmRoadCreation, handleCancelRoadCreation } = useNetworkContext();

  if (!isAddingRoad) {
    return (
      <button className="button button--primary" style={{ width: '100%' }} onClick={handleStartRoadCreation}>
        Add Road
      </button>
    );
  }

  const startLabel = roadSnapState?.startSnap
    ? (roadSnapState.startSnap.name ?? `junction #${roadSnapState.startSnap.nodeId}`)
    : 'new node';
  const endLabel = roadSnapState?.endSnap
    ? (roadSnapState.endSnap.name ?? `junction #${roadSnapState.endSnap.nodeId}`)
    : 'new node';

  return (
    <div style={{ padding: '8px', background: '#fff8e1', borderRadius: '4px', border: '1px solid #ffe082', fontSize: '12px' }}>
      <p style={{ margin: '0 0 6px 0', color: '#555' }}>
        Drag the <strong style={{ color: '#e65c00' }}>orange</strong> handles to set endpoints,
        the <strong style={{ color: '#1a78ff' }}>blue</strong> handle for the bezier curve.
        Orange snaps to existing junctions.
      </p>
      <div style={{ marginBottom: '3px' }}>
        <span style={{ color: '#888' }}>Start: </span><strong>{startLabel}</strong>
      </div>
      <div style={{ marginBottom: '8px' }}>
        <span style={{ color: '#888' }}>End: </span><strong>{endLabel}</strong>
      </div>
      <div className="two-column">
        <button className="button button--primary" onClick={handleConfirmRoadCreation}>Create</button>
        <button className="button button--secondary" onClick={handleCancelRoadCreation}>Cancel</button>
      </div>
    </div>
  );
};

export default RoadCreator;
