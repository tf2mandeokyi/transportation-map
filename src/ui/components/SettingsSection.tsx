import React, { useEffect, useState } from 'react';
import { postMessageToPlugin } from '../figma';
import { useMessageManager } from '../contexts/MessageContext';

const SettingsSection: React.FC = () => {
  const manager = useMessageManager();
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');

  useEffect(() => {
    return manager.onMessage('map-data', ({ data }) => {
      const el = document.createElement('textarea');
      el.value = data;
      el.style.cssText = 'position:fixed;top:-9999px;left:-9999px';
      document.body.appendChild(el);
      el.select();
      const success = document.execCommand('copy');
      document.body.removeChild(el);
      setCopyStatus(success ? 'copied' : 'error');
      setTimeout(() => setCopyStatus('idle'), 2000);
    });
  }, [manager]);

  const handleClearData = () => {
    if (confirm('Are you sure you want to clear all saved data? This will reload the plugin.')) {
      postMessageToPlugin({ type: 'clear-plugin-data' });
    }
  };

  const handleValidatePaths = () => {
    postMessageToPlugin({ type: 'validate-line-paths' });
  };

  const handleCopyMapData = () => {
    postMessageToPlugin({ type: 'get-map-data' });
  };

  const copyLabel = copyStatus === 'copied' ? 'Copied!' : copyStatus === 'error' ? 'Failed' : 'Copy Map Data';

  return (
    <div className="section">
      <h3>Development</h3>
      <div className="button-container">
        <button className="button button--secondary full-width" onClick={handleValidatePaths}>
          Validate Line Paths
        </button>
        <button className="button button--secondary full-width" onClick={handleCopyMapData}>
          {copyLabel}
        </button>
        <button className="button button--secondary-destructive full-width" onClick={handleClearData}>
          Clear Saved Data
        </button>
      </div>
    </div>
  );
};

export default SettingsSection;
