import React, { useState } from 'react';
import { HVAlign, TextHAlign } from '@/common/types';
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
    close(s => s.confirm({ name: stationName, textAlign, textHAlign, textRotation: 0 }));
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
      <div className="section">
        <h3>Stations</h3>
        <div className="grid">
          <button className="button button--primary" onClick={handleStartPlacing}>
            Add Station
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="section">
      <h3>Stations</h3>
      <p style={{ color: '#999', fontSize: '11px', margin: '0 0 8px' }}>
        Drag the orange handle on the canvas to snap to a road section.
      </p>
      <div className="grid">
        <div className="two-column">
          <div>
            <label htmlFor="station-name">Station Name</label>
            <textarea
              className="input"
              id="station-name"
              placeholder="Station A"
              value={stationName}
              onChange={(e) => setStationName(e.target.value)}
              rows={2}
            />
          </div>
          <div>
            <label htmlFor="station-text-align">Text Side</label>
            <select
              className="input"
              id="station-text-align"
              value={textAlign}
              onChange={(e) => setTextAlign(e.target.value as HVAlign)}
            >
              <option value="right">Right</option>
              <option value="left">Left</option>
              <option value="top">Top</option>
              <option value="bottom">Bottom</option>
            </select>
            <label htmlFor="station-text-halign">Text Alignment</label>
            <select
              className="input"
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
        <div className="two-column">
          <button className="button button--primary" onClick={handleConfirm}>
            Place Here!
          </button>
          <button className="button" onClick={handleCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default StationsSection;
