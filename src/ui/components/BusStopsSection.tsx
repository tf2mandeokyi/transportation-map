import React, { useState } from 'react';
import { StationOrientation } from '../../common/types';
import { postMessageToPlugin } from '../figma';

const BusStopsSection: React.FC = () => {
  const [stopName, setStopName] = useState('');
  const [orientation, setOrientation] = useState<StationOrientation>('RIGHT');
  const [hidden, setHidden] = useState(false);

  const handleAddStop = () => {
    const stopData = {
      name: stopName || `Stop_${Date.now()}`,
      orientation,
      hidden
    };

    postMessageToPlugin({
      type: 'add-stop',
      stop: stopData
    });

    setStopName('');
    setHidden(false);
  };

  return (
    <div className="section">
      <h3>Bus Stops</h3>
      <div className="grid">
        <div className="two-column">
          <div>
            <label htmlFor="stop-name">Stop Name</label>
            <input
              className="input"
              id="stop-name"
              type="text"
              placeholder="Stop A"
              value={stopName}
              onChange={(e) => setStopName(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="stop-orientation">Facing</label>
            <select
              className="input"
              id="stop-orientation"
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
            id="stop-hidden"
            checked={hidden}
            onChange={(e) => setHidden(e.target.checked)}
          />
          <label htmlFor="stop-hidden">Hidden (shaping point)</label>
        </div>
        <button className="button button--primary" onClick={handleAddStop}>
          Add Stop
        </button>
      </div>
    </div>
  );
};

export default BusStopsSection;
