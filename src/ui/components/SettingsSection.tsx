import React from 'react';
import { postMessageToPlugin } from '../figma';

const SettingsSection: React.FC = () => {
  const handleClearData = () => {
    if (confirm('Are you sure you want to clear all saved data? This will reload the plugin.')) {
      postMessageToPlugin({ type: 'clear-plugin-data' });
    }
  };

  return (
    <div className="section">
      <h3>Development</h3>
      <div className="button-container">
        <button className="button button--secondary-destructive full-width" onClick={handleClearData}>
          Clear Saved Data
        </button>
      </div>
    </div>
  );
};

export default SettingsSection;
