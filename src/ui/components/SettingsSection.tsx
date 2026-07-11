import React, { useEffect, useState } from 'react';
import { postMessageToPlugin } from '../figma';
import Button from './common/Button';
import ConfirmButton from './common/ConfirmButton';
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

  const handleValidatePaths = () => {
    postMessageToPlugin({ type: 'validate-line-paths' });
  };

  const handleCopyMapData = () => {
    postMessageToPlugin({ type: 'get-map-data' });
  };

  const copyLabel = copyStatus === 'copied' ? 'Copied!' : copyStatus === 'error' ? 'Failed' : 'Copy Map Data';

  return (
    <div className="mb-4 border-b border-neutral-200 pb-4">
      <h3 className="mb-3 text-sm font-semibold">Development</h3>
      <div className="mt-4 flex flex-col gap-2">
        <Button fullWidth onClick={handleValidatePaths}>
          Validate Line Paths
        </Button>
        <Button fullWidth onClick={handleCopyMapData}>
          {copyLabel}
        </Button>
        <ConfirmButton
          variant="danger"
          fullWidth
          label="Clear Saved Data"
          prompt="Clear all saved data? This will reload the plugin."
          confirmLabel="Clear"
          keepLabel="Never mind"
          onConfirm={() => postMessageToPlugin({ type: 'clear-plugin-data' })}
        />
      </div>
    </div>
  );
};

export default SettingsSection;
