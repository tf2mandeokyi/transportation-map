import React, { useState } from 'react';
import { StationOrientation } from '../../common/types';
import { postMessageToPlugin } from '../figma';

const StationsSection: React.FC = () => {
  const [stationName, setStationName] = useState('');
  const [orientation, setOrientation] = useState<StationOrientation>('RIGHT');
  const [hidden, setHidden] = useState(false);

  const handleAddStation = () => {
    const stationData = {
      name: stationName || `Station_${Date.now()}`,
      orientation,
      hidden
    };

    postMessageToPlugin({
      type: 'add-station',
      station: stationData
    });

    setStationName('');
    setHidden(false);
  };

  return (
    <div className="section">
      <h3>Stations</h3>
      <div className="grid">
        <div className="two-column">
          <div>
            <label htmlFor="station-name">Station Name</label>
            <input
              className="input"
              id="station-name"
              type="text"
              placeholder="Station A"
              value={stationName}
              onChange={(e) => setStationName(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="station-orientation">Facing</label>
            <select
              className="input"
              id="station-orientation"
              value={orientation}
              onChange={(e) => setOrientation(e.target.value as StationOrientation)}
            >
              <option value="RIGHT">Right</option>
              <option value="LEFT">Left</option>
              <option value="UP">Up</option>
              <option value="DOWN">Down</option>
            </select>
          </div>
        </div>
        <div className="checkbox-container">
          <input
            type="checkbox"
            id="station-hidden"
            checked={hidden}
            onChange={(e) => setHidden(e.target.checked)}
          />
          <label htmlFor="station-hidden">Hidden (shaping point)</label>
        </div>
        <button className="button button--primary" onClick={handleAddStation}>
          Add Station
        </button>
      </div>
    </div>
  );
};

export default StationsSection;
