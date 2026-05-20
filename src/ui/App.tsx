import React, { useState, useEffect, useRef } from 'react';
import StationsSection from './components/StationsSection';
import LinesSection from './components/LinesSection';
import EditLinePathSection from './components/EditLinePathSection';
import EditStationSection from './components/EditStationSection';
import SettingsSection from './components/SettingsSection';
import NetworkSection from './components/NetworkSection';
import { LineData, NetworkFocusedElement, NodeData, PluginToUIMessage, RoadData } from '@/common/messages';
import { NodeId } from '@/common/types';
import { LineId } from '@/common/types';
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
  const [activeTab, setActiveTab] = useState<'stations' | 'lines' | 'network' | 'settings'>('stations');
  const [lines, setLines] = useState<LineData[]>([]);
  const [currentEditingLineId, setCurrentEditingLineId] = useState<LineId | null>(null);
  const [nodes, setNodes] = useState<NodeData[]>([]);
  const [roads, setRoads] = useState<RoadData[]>([]);
  const [networkFocus, setNetworkFocus] = useState<NetworkFocusedElement | null>(null);
  const [roadCreationStep, setRoadCreationStep] = useState<'idle' | 'first' | 'second'>('idle');
  const [roadCreationFirstNode, setRoadCreationFirstNode] = useState<{ id: NodeId; name?: string } | null>(null);

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

    const unsubscribe3 = messageManagerRef.current.onMessage('network-data', msg => {
      setNodes(msg.nodes);
      setRoads(msg.roads);
    });

    const unsubscribe4 = messageManagerRef.current.onMessage('network-element-focused', msg => {
      setNetworkFocus(msg.element);
      setActiveTab('network');
    });

    const unsubscribe5 = messageManagerRef.current.onMessage('network-selection-cleared', () => {
      setNetworkFocus(null);
    });

    const unsubscribe6 = messageManagerRef.current.onMessage('road-creation-first-node', msg => {
      setRoadCreationFirstNode({ id: msg.nodeId, name: msg.name });
      setRoadCreationStep('second');
    });

    const unsubscribe7 = messageManagerRef.current.onMessage('road-creation-exited', () => {
      setRoadCreationStep('idle');
      setRoadCreationFirstNode(null);
    });

    window.onmessage = (event) => {
      const msg: PluginToUIMessage = event.data.pluginMessage;
      messageManagerRef.current.handleMessage(msg);
    };

    postMessageToPlugin({ type: 'request-initial-data' });

    return () => { unsubscribe1(); unsubscribe2(); unsubscribe3(); unsubscribe4(); unsubscribe5(); unsubscribe6(); unsubscribe7(); };
  }, []);

  const handleRemoveLine = (lineId: LineId) => {
    setLines(prev => prev.filter(line => line.id !== lineId));
  };

  const handleReorderLines = (newLines: LineData[]) => {
    setLines(newLines);
  };

  const handleStartRoadCreation = () => {
    setRoadCreationStep('first');
    setRoadCreationFirstNode(null);
    postMessageToPlugin({ type: 'start-adding-road-mode' });
  };

  const handleCancelRoadCreation = () => {
    setRoadCreationStep('idle');
    setRoadCreationFirstNode(null);
    postMessageToPlugin({ type: 'cancel-adding-road-mode' });
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
        <NavButton active={activeTab === 'network'} onClick={() => setActiveTab('network')}>
          Network
        </NavButton>
        <NavButton active={activeTab === 'settings'} onClick={() => setActiveTab('settings')}>
          Settings
        </NavButton>
      </div>

      {activeTab === 'stations' && (
        <div>
          <StationsSection roads={roads} />
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
              roads={roads}
              messageManagerRef={messageManagerRef}
              currentEditingLineId={currentEditingLineId}
              onBack={() => setCurrentEditingLineId(null)}
            />
          )}
        </div>
      )}

      {activeTab === 'network' && (
        <NetworkSection
          nodes={nodes}
          focusedElement={networkFocus}
          roadCreationStep={roadCreationStep}
          roadCreationFirstNode={roadCreationFirstNode}
          onStartRoadCreation={handleStartRoadCreation}
          onCancelRoadCreation={handleCancelRoadCreation}
        />
      )}

      {activeTab === 'settings' && <SettingsSection />}
    </div>
  );
};

export default App;
