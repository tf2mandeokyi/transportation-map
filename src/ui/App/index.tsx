import React, { useEffect, useState } from 'react';
import StationsSection from '../components/StationsSection';
import EditStationSection from '../components/EditStationSection';
import NetworkSection from '../components/NetworkSection';
import SettingsSection from '../components/SettingsSection';
import { postMessageToPlugin } from '../figma';
import Button from '../components/common/Button';
import NavButton from './NavButton';
import LineTabContent from './LineTabContent';

type Tab = 'stations' | 'lines' | 'network' | 'settings';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('stations');

  useEffect(() => {
    postMessageToPlugin({ type: 'request-initial-data' });
  }, []);

  return (
    <div className="p-4 font-sans text-xs text-neutral-900">
      <div className="mb-4">
        <Button fullWidth onClick={() => postMessageToPlugin({ type: 'render-map' })}>
          Render Map
        </Button>
      </div>

      <div className="mb-4 flex border-b border-neutral-200">
        <NavButton active={activeTab === 'stations'} onClick={() => setActiveTab('stations')}>Stations</NavButton>
        <NavButton active={activeTab === 'lines'}    onClick={() => setActiveTab('lines')}>Lines</NavButton>
        <NavButton active={activeTab === 'network'}  onClick={() => setActiveTab('network')}>Network</NavButton>
        <NavButton active={activeTab === 'settings'} onClick={() => setActiveTab('settings')}>Settings</NavButton>
      </div>

      {activeTab === 'stations' && (
        <div>
          <StationsSection />
          <EditStationSection />
        </div>
      )}
      {activeTab === 'lines'    && <LineTabContent />}
      {activeTab === 'network'  && <NetworkSection />}
      {activeTab === 'settings' && <SettingsSection />}
    </div>
  );
};

export default App;
