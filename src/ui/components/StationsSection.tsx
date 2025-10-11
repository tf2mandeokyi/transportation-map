import React, { useState } from 'react';
import { StationOrientation } from '../../common/types';
import { postMessageToPlugin } from '../figma';

const StationsSection: React.FC = () => {
  const [stationName, setStationName] = useState('');
  const [orientation, setOrientation] = useState<StationOrientation | 'UP,DOWN' | 'LEFT,RIGHT'>('RIGHT');
  const [hidden, setHidden] = useState(false);

  const handleAddStation = () => {
    const stationData = {
      name: stationName,
      hidden
    };

    const sendAddStationMessage = (orientation: StationOrientation) => {
      postMessageToPlugin({
        type: 'add-station',
        station: { ...stationData, orientation }
      });
    }

    if (orientation === 'UP,DOWN') {
      sendAddStationMessage('UP');
      sendAddStationMessage('DOWN');
      return;
    }
    else if (orientation === 'LEFT,RIGHT') {
      sendAddStationMessage('LEFT');
      sendAddStationMessage('RIGHT');
      return;
    }
    sendAddStationMessage(orientation);
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
              <option value="UP,DOWN">Up and Down</option>
              <option value="LEFT,RIGHT">Left and Right</option>
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
