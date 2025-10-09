import React, { useState } from 'react';

const SettingsSection: React.FC = () => {
  const [rightHandTraffic, setRightHandTraffic] = useState(true);

  const handleRenderMap = () => {
    parent.postMessage({
      pluginMessage: {
        type: 'render-map',
        rightHandTraffic
      }
    }, '*');
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
    </>
  );
};

export default SettingsSection;
