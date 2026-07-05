import React from 'react';
import { useNetworkContext } from '../../contexts/NetworkContext';

const RoadCreator: React.FC = () => {
  const { isAddingRoad, roadSnapState, handleStartRoadCreation, handleConfirmRoadCreation, handleCancelRoadCreation } = useNetworkContext();

  if (!isAddingRoad) {
    return (
      <button className="w-full rounded bg-[#18a0fb] px-3 py-2 font-medium text-white hover:bg-[#0d8ee0]" onClick={handleStartRoadCreation}>
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
    <div className="rounded border border-[#ffe082] bg-[#fff8e1] p-2 text-xs">
      <p className="mb-1.5 text-neutral-600">
        Drag the <strong className="text-[#e65c00]">orange</strong> handles to set endpoints,
        the <strong className="text-[#1a78ff]">blue</strong> handle for the bezier curve.
        Orange snaps to existing junctions.
      </p>
      <div className="mb-1">
        <span className="text-neutral-500">Start: </span><strong>{startLabel}</strong>
      </div>
      <div className="mb-2">
        <span className="text-neutral-500">End: </span><strong>{endLabel}</strong>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button className="rounded bg-[#18a0fb] px-3 py-2 font-medium text-white hover:bg-[#0d8ee0]" onClick={handleConfirmRoadCreation}>Create</button>
        <button className="rounded border border-neutral-300 bg-neutral-100 px-3 py-2 font-medium hover:bg-neutral-200" onClick={handleCancelRoadCreation}>Cancel</button>
      </div>
    </div>
  );
};

export default RoadCreator;
