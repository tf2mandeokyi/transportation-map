import React, { useState, useEffect } from 'react';
import BusStopsSection from './components/BusStopsSection';
import BusLinesSection from './components/BusLinesSection';
import ConnectStationsSection from './components/ConnectStationsSection';
import EditLinePathSection from './components/EditLinePathSection';
import EditStationSection from './components/EditStationSection';
import SettingsSection from './components/SettingsSection';
import { LineAtStationData, LineData, PluginToUIMessage } from '../common/messages';
import { LineId, StationId, StationOrientation } from '../common/types';
import { postMessageToPlugin } from './figma';

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
  const [isAddingStations, setIsAddingStations] = useState(false);
  const [stationPath, setStationPath] = useState<StationId[]>([]);
  const [stationPathNames, setStationPathNames] = useState<string[]>([]);
  const [currentEditingLineId, setCurrentEditingLineId] = useState<LineId | null>(null);
  const [linePathData, setLinePathData] = useState<{ lineId: LineId; stationIds: StationId[]; stationNames: string[]; stopsAt: boolean[] } | null>(null);

  // State for station editing
  const [editingStationId, setEditingStationId] = useState<StationId | null>(null);
  const [editingStationName, setEditingStationName] = useState<string | null>(null);
  const [editingStationOrientation, setEditingStationOrientation] = useState<StationOrientation | null>(null);
  const [editingStationHidden, setEditingStationHidden] = useState<boolean | null>(null);
  const [linesAtStation, setLinesAtStation] = useState<Array<LineAtStationData>>([]);

  useEffect(() => {
    // Listen for messages from the plugin
    window.onmessage = (event) => {
      const msg: PluginToUIMessage = event.data.pluginMessage;
      console.log('Received message from plugin:', msg);

      switch (msg.type) {
        case 'line-added':
          setLines(prev => {
            // Check if line already exists to avoid duplicates
            const exists = prev.some(line => line.id === msg.id);
            if (exists) {
              return prev;
            }
            return [...prev, msg];
          });
          break;

        case 'station-clicked':
          setIsAddingStations(current => {
            if (current) {
              // Allow adding the same station multiple times for circular routes
              setStationPath(prev => [...prev, msg.stationId]);
              setStationPathNames(prev => [...prev, msg.stationName]);
            } else {
              // Not in adding stations mode, so this is a station edit request
              postMessageToPlugin({
                type: 'get-station-info',
                stationId: msg.stationId
              });
            }
            return current;
          });
          break;

        case 'station-info':
          setEditingStationId(msg.stationId);
          setEditingStationName(msg.stationName);
          setEditingStationOrientation(msg.orientation);
          setEditingStationHidden(msg.hidden);
          setLinesAtStation(msg.lines);
          break;

        case 'line-path-data':
          setLinePathData(msg);
          break;

        case 'toggle-stops-at':
          // Update the local state for the toggled line
          setLinesAtStation(prev => prev.map(line =>
            line.id === msg.lineId ? { ...line, stopsAt: msg.stopsAt } : line
          ));
          break;

        case 'station-removed-from-line':
          // Refresh the current line path if we're editing
          setCurrentEditingLineId(current => {
            if (current) {
              postMessageToPlugin({
                type: 'get-line-path',
                lineId: current
              });
            }
            return current;
          });
          break;

        case 'stations-connected':
          console.log('Stations connected to line');
          break;

        case 'stop-added':
          // Stop was successfully added
          break;
      }
    };

    // Request initial line data when UI is ready
    postMessageToPlugin({ type: 'request-initial-data' });
  }, []); // Empty dependency array - only run once on mount

  const handleRemoveLine = (lineId: LineId) => {
    setLines(prev => prev.filter(line => line.id !== lineId));
  };

  const handleToggleStopsAt = (lineId: LineId, currentStopsAt: boolean) => {
    if (!editingStationId) return;

    postMessageToPlugin({
      type: 'set-line-stops-at-station',
      lineId,
      stationId: editingStationId,
      stopsAt: !currentStopsAt
    });
  };

  const handleRemoveLineFromStation = (lineId: LineId) => {
    if (!editingStationId) return;

    postMessageToPlugin({
      type: 'remove-line-from-station',
      stationId: editingStationId,
      lineId: lineId
    });
  };

  const handleUpdateStation = (name: string, orientation: StationOrientation, hidden: boolean) => {
    if (!editingStationId) return;

    postMessageToPlugin({
      type: 'update-station',
      stationId: editingStationId,
      name,
      orientation,
      hidden
    });
  };

  const handleCloseStationEdit = () => {
    setEditingStationId(null);
    setEditingStationName(null);
    setEditingStationOrientation(null);
    setEditingStationHidden(null);
    setLinesAtStation([]);
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
          <BusStopsSection />
          <EditStationSection
            stationId={editingStationId}
            stationName={editingStationName}
            stationOrientation={editingStationOrientation}
            stationHidden={editingStationHidden}
            linesAtStation={linesAtStation}
            onToggleStopsAt={handleToggleStopsAt}
            onRemoveLine={handleRemoveLineFromStation}
            onUpdateStation={handleUpdateStation}
            onClose={handleCloseStationEdit}
          />
        </div>
      )}

      {activeTab === 'lines' && (
        <div>
          <BusLinesSection lines={lines} onRemoveLine={handleRemoveLine} />
          <ConnectStationsSection
            lines={lines}
            isAddingStations={isAddingStations}
            setIsAddingStations={setIsAddingStations}
            stationPath={stationPath}
            setStationPath={setStationPath}
            stationPathNames={stationPathNames}
            setStationPathNames={setStationPathNames}
          />
          <EditLinePathSection
            lines={lines}
            currentEditingLineId={currentEditingLineId}
            setCurrentEditingLineId={setCurrentEditingLineId}
            linePathData={linePathData}
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
