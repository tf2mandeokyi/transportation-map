import React from 'react';
import { RoadCreationSnap } from '@/common/messages';
import Button from '../common/Button';
import { useNetworkContext } from '../../contexts/NetworkContext';

function snapLabel(snap: RoadCreationSnap): string {
  if (!snap) return 'new node';
  if (snap.kind === 'node') return snap.name ?? `junction #${snap.nodeId}`;
  return `splice into ${snap.name ?? `road #${snap.roadId}`}`;
}

const RoadCreator: React.FC = () => {
  const {
    isAddingRoad, roadSnapState, roadSnapModeEnabled,
    handleStartRoadCreation, handleConfirmRoadCreation, handleCancelRoadCreation, handleSetRoadSnapMode,
  } = useNetworkContext();

  if (!isAddingRoad) {
    return (
      <Button variant="primary" fullWidth onClick={handleStartRoadCreation}>
        Add Road
      </Button>
    );
  }

  const startLabel = snapLabel(roadSnapState?.startSnap ?? null);
  const endLabel = snapLabel(roadSnapState?.endSnap ?? null);

  return (
    <div className="rounded border border-[#ffe082] bg-[#fff8e1] p-2 text-xs">
      <p className="mb-1.5 text-neutral-600">
        Drag the <strong className="text-[#e65c00]">orange</strong> handles to set endpoints,
        the <strong className="text-[#1a78ff]">blue</strong> handle for the bezier curve.
        Orange snaps to existing junctions and to points along existing roads.
      </p>
      <label className="mb-1.5 flex items-center gap-1.5 text-neutral-600">
        <input
          type="checkbox"
          checked={roadSnapModeEnabled}
          onChange={e => handleSetRoadSnapMode(e.target.checked)}
        />
        Snap to junctions &amp; roads
      </label>
      <div className="mb-1">
        <span className="text-neutral-500">Start: </span><strong>{startLabel}</strong>
      </div>
      <div className="mb-2">
        <span className="text-neutral-500">End: </span><strong>{endLabel}</strong>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="primary" onClick={handleConfirmRoadCreation}>Create</Button>
        <Button onClick={handleCancelRoadCreation}>Cancel</Button>
      </div>
    </div>
  );
};

export default RoadCreator;
