import React, { useState, useEffect, useRef } from 'react';
import StationsSection from './components/StationsSection';
import LinesSection from './components/LinesSection';
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
  const [currentEditingLineId, setCurrentEditingLineId] = useState<LineId | null>(null);

  // State for station editing

  const messageManagerRef = useRef(new FigmaPluginMessageManager());
  const rightHandTraffic = useRef(true);

  useEffect(() => {
    // Set up message listeners
    const unsubscribe1 = messageManagerRef.current.onMessage('line-added', msg => {
      setLines(prev => {
        // Check if line already exists to avoid duplicates
        const exists = prev.some(line => line.id === msg.id);
        if (exists) {
          // Update existing line data
          return prev.map(line =>
            line.id === msg.id
              ? { id: msg.id, name: msg.name, color: msg.color }
              : line
          );
        }
        return [...prev, msg];
      });
    });

    const unsubscribe2 = messageManagerRef.current.onMessage('station-added', () => {
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

  const handleReorderLines = (newLines: LineData[]) => {
    setLines(newLines);
  };

  const handleEditLine = (lineId: LineId) => {
    setCurrentEditingLineId(lineId);
  };

  const handleRenderMap = () => {
    postMessageToPlugin({
      type: 'render-map',
      rightHandTraffic: rightHandTraffic.current
    });
  };

  return (
    <div>
      <div className="button-container" style={{ marginBottom: '16px' }}>
        <button className="button button--secondary full-width" onClick={handleRenderMap} style={{ width: '100%' }}>
          Render Map
        </button>
      </div>

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
          {!currentEditingLineId ? (
            <LinesSection
              lines={lines}
              onRemoveLine={handleRemoveLine}
              onEditLine={handleEditLine}
              onReorderLines={handleReorderLines}
            />
          ) : (
            <EditLinePathSection
              lines={lines}
              messageManagerRef={messageManagerRef}
              currentEditingLineId={currentEditingLineId}
              onBack={() => setCurrentEditingLineId(null)}
            />
          )}
        </div>
      )}

      {activeTab === 'settings' && (
        <div>
          <SettingsSection rightHandTraffic={rightHandTraffic} />
        </div>
      )}
    </div>
  );
};

export default App;
