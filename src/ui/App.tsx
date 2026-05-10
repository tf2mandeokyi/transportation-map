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

  const messageManagerRef = useRef(new FigmaPluginMessageManager());

  useEffect(() => {
    const unsubscribe1 = messageManagerRef.current.onMessage('line-added', msg => {
      setLines(prev => {
        const exists = prev.some(line => line.id === msg.id);
        if (exists) {
          return prev.map(line =>
            line.id === msg.id ? { id: msg.id, name: msg.name, color: msg.color } : line
          );
        }
        return [...prev, msg];
      });
    });

    const unsubscribe2 = messageManagerRef.current.onMessage('station-added', () => {});

    window.onmessage = (event) => {
      const msg: PluginToUIMessage = event.data.pluginMessage;
      messageManagerRef.current.handleMessage(msg);
    };

    postMessageToPlugin({ type: 'request-initial-data' });

    return () => { unsubscribe1(); unsubscribe2(); };
  }, []);

  const handleRemoveLine = (lineId: LineId) => {
    setLines(prev => prev.filter(line => line.id !== lineId));
  };

  const handleReorderLines = (newLines: LineData[]) => {
    setLines(newLines);
  };

  const handleRenderMap = () => {
    postMessageToPlugin({ type: 'render-map' });
  };

  return (
    <div>
      <div className="button-container" style={{ marginBottom: '16px' }}>
        <button className="button button--secondary full-width" onClick={handleRenderMap} style={{ width: '100%' }}>
          Render Map
        </button>
      </div>

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

      {activeTab === 'stations' && (
        <div>
          <StationsSection />
          <EditStationSection messageManagerRef={messageManagerRef} />
        </div>
      )}

      {activeTab === 'lines' && (
        <div>
          {!currentEditingLineId ? (
            <LinesSection
              lines={lines}
              onRemoveLine={handleRemoveLine}
              onEditLine={(lineId) => setCurrentEditingLineId(lineId)}
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

      {activeTab === 'settings' && <SettingsSection />}
    </div>
  );
};

export default App;
