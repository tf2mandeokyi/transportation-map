import React from 'react';
import { useNetworkContext } from '../../contexts/NetworkContext';
import FocusedNodePanel from './FocusedNodePanel';
import FocusedRoadPanel from './FocusedRoadPanel';
import RoadCreator from './RoadCreator';

const NetworkSection: React.FC = () => {
  const { nodes, networkFocus } = useNetworkContext();

  return (
    <div>
      {networkFocus?.kind === 'node' && <FocusedNodePanel key={networkFocus.nodeId} element={networkFocus} />}
      {networkFocus?.kind === 'road' && <FocusedRoadPanel element={networkFocus} nodes={nodes} />}

      <div className="section">
        <h3>Add Road</h3>
        <RoadCreator />
      </div>
    </div>
  );
};

export default NetworkSection;
