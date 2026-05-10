import React, { useState } from 'react';
import { HVAlign } from '../../common/types';
import { postMessageToPlugin } from '../figma';

const StationsSection: React.FC = () => {
  const [stationName, setStationName] = useState('');
  const [textAlign, setTextAlign] = useState<HVAlign>('right');

  const handleAddStation = () => {
    postMessageToPlugin({
      type: 'add-station',
      station: { name: stationName, textAlign }
    });
    setStationName('');
  };

  return (
    <div className="section">
      <h3>Stations</h3>
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
          </div>
        </div>
        <button className="button button--primary" onClick={handleAddStation}>
          Add Station
        </button>
      </div>
    </div>
  );
};

export default StationsSection;
