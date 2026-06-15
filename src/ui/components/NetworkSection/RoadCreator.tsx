import React from 'react';
import { useNetworkContext } from '../../contexts/NetworkContext';

const RoadCreator: React.FC = () => {
  const { roadCreationStep, roadCreationFirstNode, handleStartRoadCreation, handleCancelRoadCreation } = useNetworkContext();

  if (roadCreationStep === 'idle') {
    return <button className="button button--primary" style={{ width: '100%' }} onClick={handleStartRoadCreation}>Add Road</button>;
  }

  return (
    <div style={{ fontSize: '12px' }}>
      <div style={{ padding: '8px', background: '#fff8e1', borderRadius: '4px', marginBottom: '8px' }}>
        {roadCreationStep === 'first' && <span style={{ color: '#666' }}>Click the <strong>start</strong> junction on the canvas…</span>}
        {roadCreationStep === 'second' && (
          <>
            <div style={{ color: '#333', marginBottom: '4px' }}>Start: <strong>{roadCreationFirstNode?.name ?? roadCreationFirstNode?.id}</strong></div>
            <span style={{ color: '#666' }}>Click the <strong>end</strong> junction on the canvas…</span>
          </>
        )}
      </div>
      <button className="button button--secondary" style={{ width: '100%' }} onClick={handleCancelRoadCreation}>Cancel</button>
    </div>
  );
};

export default RoadCreator;
