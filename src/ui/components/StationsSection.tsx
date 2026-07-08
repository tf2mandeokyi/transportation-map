import React, { useState } from 'react';
import { HVAlign, TextHAlign } from '@/common/types';
import Button from './common/Button';
import { useMessageManager } from '../contexts/MessageContext';
import { PlacingStationUISession } from '../sessions/placing-station';
import { useUISession } from '../sessions/useUISession';

const StationsSection: React.FC = () => {
  const manager = useMessageManager();
  const { open, close } = useUISession<PlacingStationUISession>();

  const [isPlacing, setIsPlacing] = useState(false);
  const [stationName, setStationName] = useState('');
  const [textAlign, setTextAlign] = useState<HVAlign>('right');
  const [textHAlign, setTextHAlign] = useState<TextHAlign>('left');

  const handleStartPlacing = () => {
    open(new PlacingStationUISession()).start(manager);
    setIsPlacing(true);
  };

  const handleConfirm = () => {
    close(s => s.confirm({ name: stationName, textAlign, textHAlign, textRotation: 0, flipped: false }));
    setIsPlacing(false);
    setStationName('');
  };

  const handleCancel = () => {
    close(s => s.cancel());
    setIsPlacing(false);
    setStationName('');
  };

  if (!isPlacing) {
    return (
      <div className="mb-4 border-b border-neutral-200 pb-4">
        <h3 className="mb-3 text-sm font-semibold">Stations</h3>
        <div className="flex flex-col gap-2">
          <Button variant="primary" onClick={handleStartPlacing}>
            Add Station
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-4 border-b border-neutral-200 pb-4">
      <h3 className="mb-3 text-sm font-semibold">Stations</h3>
      <p className="mb-2 text-[11px] text-neutral-400">
        Drag the orange handle on the canvas to snap to a road section.
      </p>
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="station-name" className="mb-1 block font-medium select-none">Station Name</label>
            <textarea
              className="w-full rounded border border-neutral-300 px-2 py-1 text-xs"
              id="station-name"
              placeholder="Station A"
              value={stationName}
              onChange={(e) => setStationName(e.target.value)}
              rows={2}
            />
          </div>
          <div>
            <label htmlFor="station-text-align" className="mb-1 block font-medium select-none">Text Side</label>
            <select
              className="w-full rounded border border-neutral-300 px-2 py-1 text-xs"
              id="station-text-align"
              value={textAlign}
              onChange={(e) => setTextAlign(e.target.value as HVAlign)}
            >
              <option value="right">Right</option>
              <option value="left">Left</option>
              <option value="top">Top</option>
              <option value="bottom">Bottom</option>
            </select>
            <label htmlFor="station-text-halign" className="mt-2 mb-1 block font-medium select-none">Text Alignment</label>
            <select
              className="w-full rounded border border-neutral-300 px-2 py-1 text-xs"
              id="station-text-halign"
              value={textHAlign}
              onChange={(e) => setTextHAlign(e.target.value as TextHAlign)}
            >
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="primary" onClick={handleConfirm}>
            Place Here!
          </Button>
          <Button onClick={handleCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
};

export default StationsSection;
