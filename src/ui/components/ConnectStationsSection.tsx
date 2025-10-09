import React, { useState } from 'react';

interface LineData {
  id: string;
  name: string;
  color: string;
}

interface Props {
  lines: LineData[];
  isAddingStations: boolean;
  setIsAddingStations: (value: boolean) => void;
  stationPath: string[];
  setStationPath: (value: string[]) => void;
  stationPathNames: string[];
  setStationPathNames: (value: string[]) => void;
}

const ConnectStationsSection: React.FC<Props> = ({
  lines,
  isAddingStations,
  setIsAddingStations,
  stationPath,
  setStationPath,
  stationPathNames,
  setStationPathNames
}) => {
  const [selectedLineId, setSelectedLineId] = useState('');
  const [stopsAt, setStopsAt] = useState(true);

  const handleStartAdding = () => {
    setIsAddingStations(true);
    setStationPath([]);
    setStationPathNames([]);

    parent.postMessage({
      pluginMessage: {
        type: 'start-adding-stations-mode',
        lineId: selectedLineId
      }
    }, '*');
  };

  const handleFinish = () => {
    if (!selectedLineId || stationPath.length === 0) {
      return;
    }

    parent.postMessage({
      pluginMessage: {
        type: 'connect-stations-to-line',
        lineId: selectedLineId,
        stationIds: stationPath,
        stopsAt
      }
    }, '*');

    setIsAddingStations(false);
    setStationPath([]);
    setStationPathNames([]);

    parent.postMessage({
      pluginMessage: {
        type: 'stop-adding-stations-mode'
      }
    }, '*');
  };

  const handleClearPath = () => {
    setStationPath([]);
    setStationPathNames([]);
  };

  const handleLineChange = (newLineId: string) => {
    if (isAddingStations) {
      setIsAddingStations(false);
      setStationPath([]);
      setStationPathNames([]);
      parent.postMessage({
        pluginMessage: {
          type: 'stop-adding-stations-mode'
        }
      }, '*');
    }
    setSelectedLineId(newLineId);
  };

  const pathDisplay = stationPath.length === 0
    ? 'None'
    : stationPathNames.map((name, idx) => `${idx + 1}. ${name}`).join(' → ');

  const hasLineSelected = !!selectedLineId;
  const hasPath = stationPath.length > 0;

  return (
    <div className="section">
      <h3>Connect Stations to Line</h3>
      <div className="grid">
        <div>
          <label htmlFor="connect-line-select">Select Line</label>
          <select
            className="input"
            id="connect-line-select"
            value={selectedLineId}
            onChange={(e) => handleLineChange(e.target.value)}
          >
            <option value="">Choose a line...</option>
            {lines.map(line => (
              <option key={line.id} value={line.id}>{line.name}</option>
            ))}
          </select>
        </div>
        <div>
          <p style={{ fontSize: '11px', color: '#666', margin: 0 }}>
            1. Select line above<br />
            2. Click "Start Adding Stations"<br />
            3. Click stations on canvas in order<br />
            4. Click "Finish" when done
          </p>
        </div>
        <div style={{ fontSize: '11px', padding: '8px', background: '#f5f5f5', borderRadius: '4px', minHeight: '40px' }}>
          <strong>Path:</strong> <span>{pathDisplay}</span>
        </div>
        <div className="checkbox-container">
          <input
            type="checkbox"
            id="stops-at-station"
            checked={stopsAt}
            onChange={(e) => setStopsAt(e.target.checked)}
          />
          <label htmlFor="stops-at-station">Line stops at these stations</label>
        </div>
        <div className="two-column">
          <button
            className="button button--primary"
            onClick={handleStartAdding}
            disabled={!hasLineSelected || isAddingStations}
            style={isAddingStations ? { backgroundColor: '#18a0fb' } : {}}
          >
            {isAddingStations ? 'Adding... (click stations)' : 'Start Adding Stations'}
          </button>
          <button
            className="button button--secondary"
            onClick={handleFinish}
            disabled={!isAddingStations || !hasPath}
          >
            Finish
          </button>
        </div>
        <button
          className="button button--secondary full-width"
          onClick={handleClearPath}
          disabled={!hasPath}
        >
          Clear Path
        </button>
      </div>
    </div>
  );
};

export default ConnectStationsSection;
