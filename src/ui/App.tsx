import React, { useState, useEffect, useRef } from 'react';
import StationsSection from './components/StationsSection';
import BusLinesSection from './components/BusLinesSection';
import EditLinePathSection from './components/EditLinePathSection';
import EditStationSection from './components/EditStationSection';
import SettingsSection from './components/SettingsSection';
import { LineData, PluginToUIMessage } from '../common/messages';
import { LineId } from '../common/types';
import { postMessageToPlugin } from './figma';
import { FigmaPluginMessageManager } from './events';

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

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'stations' | 'lines' | 'settings'>('stations');
  const [lines, setLines] = useState<LineData[]>([]);

  // State for station editing

  const messageManagerRef = useRef(new FigmaPluginMessageManager());

  useEffect(() => {
    // Set up message listeners
    const unsubscribe1 = messageManagerRef.current.onMessage('line-added', msg => {
      setLines(prev => {
        // Check if line already exists to avoid duplicates
        const exists = prev.some(line => line.id === msg.id);
        if (exists) {
          return prev;
        }
        return [...prev, msg];
      });
    });

    const unsubscribe2 = messageManagerRef.current.onMessage('stop-added', () => {
      // Stop was successfully added
    });

    // Listen for messages from the plugin
    window.onmessage = (event) => {
      const msg: PluginToUIMessage = event.data.pluginMessage;
      messageManagerRef.current.handleMessage(msg);
    };

    // Request initial line data when UI is ready
    postMessageToPlugin({ type: 'request-initial-data' });

    // Cleanup
    return () => {
      unsubscribe1();
      unsubscribe2();
    };
  }, []); // Empty dependency array - only run once on mount

  const handleRemoveLine = (lineId: LineId) => {
    setLines(prev => prev.filter(line => line.id !== lineId));
  };

  return (
    <div>
      {/* Tab Navigation */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e0e0e0', marginBottom: '16px' }}>
        <NavButton active={activeTab === 'stations'} onClick={() => setActiveTab('stations')}>
          Stations
        </NavButton>
        <NavButton active={activeTab === 'lines'} onClick={() => setActiveTab('lines')}>
          Lines
        </NavButton>
        <NavButton active={activeTab === 'settings'} onClick={() => setActiveTab('settings')}>
          Settings
        </NavButton>
      </div>

      {/* Tab Content */}
      {activeTab === 'stations' && (
        <div>
          <StationsSection />
          <EditStationSection
            messageManagerRef={messageManagerRef}
          />
        </div>
      )}

      {activeTab === 'lines' && (
        <div>
          <BusLinesSection
            lines={lines}
            onRemoveLine={handleRemoveLine}
          />
          <EditLinePathSection
            lines={lines}
            messageManagerRef={messageManagerRef}
          />
        </div>
      )}

      {activeTab === 'settings' && (
        <div>
          <SettingsSection />
        </div>
      )}
    </div>
  );
};

export default App;
