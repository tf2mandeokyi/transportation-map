import React, { useEffect, useState } from 'react';
import StationsSection from './components/StationsSection';
import LinesSection from './components/LinesSection';
import EditLinePathSection from './components/EditLinePathSection';
import EditStationSection from './components/EditStationSection';
import NetworkSection from './components/NetworkSection';
import SettingsSection from './components/SettingsSection';
import { postMessageToPlugin } from './figma';
import { useLinesContext } from './contexts/LinesContext';

type Tab = 'stations' | 'lines' | 'network' | 'settings';

interface NavButtonProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

const NavButton: React.FC<NavButtonProps> = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    style={{
      flex: 1,
      padding: '12px',
      border: 'none',
      background: active ? '#18a0fb' : 'transparent',
      color: active ? 'white' : '#333',
      cursor: 'pointer',
      fontWeight: active ? 'bold' : 'normal'
    }}
  >
    {children}
  </button>
);

const LineTabContent: React.FC = () => {
  const { currentEditingLineId } = useLinesContext();
  return currentEditingLineId ? <EditLinePathSection /> : <LinesSection />;
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('stations');

  useEffect(() => {
    postMessageToPlugin({ type: 'request-initial-data' });
  }, []);

  return (
    <div>
      <div className="button-container" style={{ marginBottom: '16px' }}>
        <button
          className="button button--secondary full-width"
          onClick={() => postMessageToPlugin({ type: 'render-map' })}
          style={{ width: '100%' }}
        >
          Render Map
        </button>
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid #e0e0e0', marginBottom: '16px' }}>
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
