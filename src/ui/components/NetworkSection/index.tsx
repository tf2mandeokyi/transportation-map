import React from 'react';
import { useNetworkDataContext } from '../../contexts/NetworkContext';
import FocusedNodePanel from './FocusedNodePanel';
import FocusedRoadPanel from './FocusedRoadPanel';
import RoadCreator from './RoadCreator';

const NetworkSection: React.FC = () => {
  const { nodes, networkFocus } = useNetworkDataContext();

  return (
    <div>
      {networkFocus?.kind === 'node' && <FocusedNodePanel key={networkFocus.nodeId} element={networkFocus} />}
      {networkFocus?.kind === 'road' && <FocusedRoadPanel key={networkFocus.roadId} element={networkFocus} nodes={nodes} />}

      <div className="mb-4 border-b border-neutral-200 pb-4">
        <h3 className="mb-3 text-sm font-semibold">Add Road</h3>
        <RoadCreator />
      </div>
    </div>
  );
};

export default NetworkSection;
