import React, { useState, useEffect } from 'react';
import BusStopsSection from './components/BusStopsSection';
import BusLinesSection from './components/BusLinesSection';
import ConnectStationsSection from './components/ConnectStationsSection';
import EditLinePathSection from './components/EditLinePathSection';
import SettingsSection from './components/SettingsSection';
import { PluginToUIMessage } from '../common/messages';
import { LineId, StationId } from '../common/types';
import { LineData } from './types';
import { postMessageToPlugin } from './figma';

const App: React.FC = () => {
  const [lines, setLines] = useState<LineData[]>([]);
  const [isAddingStations, setIsAddingStations] = useState(false);
  const [stationPath, setStationPath] = useState<StationId[]>([]);
  const [stationPathNames, setStationPathNames] = useState<string[]>([]);
  const [currentEditingLineId, setCurrentEditingLineId] = useState<LineId | null>(null);
  const [linePathData, setLinePathData] = useState<{ lineId: LineId; stationIds: StationId[]; stationNames: string[]; stopsAt: boolean[] } | null>(null);

  useEffect(() => {
    // Listen for messages from the plugin
    window.onmessage = (event) => {
      const msg: PluginToUIMessage = event.data.pluginMessage;
      console.log('Received message from plugin:', msg);

      switch (msg.type) {
        case 'line-added':
          setLines(prev => [...prev, { id: msg.lineId, name: msg.name, color: msg.color }]);
          break;

        case 'station-clicked':
          if (isAddingStations) {
            if (!stationPath.includes(msg.stationId)) {
              setStationPath(prev => [...prev, msg.stationId]);
              setStationPathNames(prev => [...prev, msg.stationName]);
            }
          }
          break;

        case 'line-path-data':
          setLinePathData(msg);
          break;

        case 'station-removed-from-line':
          // Refresh the current line path if we're editing
          if (currentEditingLineId) {
            postMessageToPlugin({
              type: 'get-line-path',
              lineId: currentEditingLineId
            });
          }
          break;

        case 'stations-connected':
          console.log('Stations connected to line');
          break;

        case 'stop-added':
          // Stop was successfully added
          break;
      }
    };
  }, [isAddingStations, stationPath, currentEditingLineId]);

  const handleRemoveLine = (lineId: LineId) => {
    setLines(prev => prev.filter(line => line.id !== lineId));
  };

  return (
    <div>
      <BusStopsSection />
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
      <SettingsSection />
    </div>
  );
};

export default App;
