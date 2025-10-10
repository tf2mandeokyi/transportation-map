import React, { useState } from 'react';
import { postMessageToPlugin } from '../figma';

const SettingsSection: React.FC = () => {
  const [rightHandTraffic, setRightHandTraffic] = useState(true);

  const handleRenderMap = () => {
    postMessageToPlugin({
      type: 'render-map',
      rightHandTraffic
    });
  };

  const handleClearData = () => {
    if (confirm('Are you sure you want to clear all saved data? This will reload the plugin.')) {
      postMessageToPlugin({
        type: 'clear-plugin-data'
      });
    }
  };

  return (
    <>
      <div className="section">
        <h3>Traffic Direction</h3>
        <div className="checkbox-container">
          <input
            type="checkbox"
            id="right-hand-traffic"
            checked={rightHandTraffic}
            onChange={(e) => setRightHandTraffic(e.target.checked)}
          />
          <label htmlFor="right-hand-traffic">Right-hand traffic</label>
        </div>
      </div>

      <div className="button-container">
        <button className="button button--secondary full-width" onClick={handleRenderMap}>
          Render Map
        </button>
      </div>

      <div className="section">
        <h3>Development</h3>
        <div className="button-container">
          <button className="button button--secondary-destructive full-width" onClick={handleClearData}>
            Clear Saved Data
          </button>
        </div>
      </div>
    </>
  );
};

export default SettingsSection;
