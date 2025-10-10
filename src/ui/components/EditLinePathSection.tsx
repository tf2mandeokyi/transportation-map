import React, { useState } from 'react';
import { LineId, StationId } from '../../common/types';
import { postMessageToPlugin } from '../figma';
import { LineData } from '../../common/messages';
import { FigmaPluginMessageManager } from '../events';

interface Props {
  lines: LineData[];
  messageManagerRef: React.RefObject<FigmaPluginMessageManager>;
}

const EditLinePathSection: React.FC<Props> = ({
  lines,
  messageManagerRef
}) => {
  const [currentEditingLineId, setCurrentEditingLineId] = useState<LineId | null>(null);
  const [linePathData, setLinePathData] = useState<{ lineId: LineId; stationIds: StationId[]; stationNames: string[]; stopsAt: boolean[] } | null>(null);

  // Station insertion state
  const [isAddingStations, setIsAddingStations] = useState(false);
  const [insertionIndex, setInsertionIndex] = useState<number | null>(null);
  const [stationPath, setStationPath] = useState<{ id: StationId, name: string }[]>([]);
  const [stopsAt, setStopsAt] = useState(true);

  messageManagerRef.current.onMessage('station-removed-from-line', () => {
    setCurrentEditingLineId(current => {
      if (current) {
        postMessageToPlugin({
          type: 'get-line-path',
          lineId: current
        });
      }
      return current;
    });
  });

  messageManagerRef.current.onMessage('line-path-data', msg => {
    setLinePathData(msg);
  });

  messageManagerRef.current.onMessage('station-clicked', msg => {
    setIsAddingStations(current => {
      if (current) {
        // Allow adding the same station multiple times for circular routes
        setStationPath(prev => [...prev, { id: msg.stationId, name: msg.stationName }]);
      } else {
        // Not in adding stations mode, so this is a station edit request
        postMessageToPlugin({
          type: 'get-station-info',
          stationId: msg.stationId
        });
      }
      return current;
    });
  });

  const handleLineChange = (lineId: LineId) => {
    if (lineId) {
      setCurrentEditingLineId(lineId);
      postMessageToPlugin({
        type: 'get-line-path',
        lineId
      });
    } else {
      setCurrentEditingLineId(null);
    }

    // Cancel any ongoing station insertion
    if (isAddingStations) {
      handleCancelInsertion();
    }
  };

  const handleRemoveStation = (lineId: LineId, stationId: StationId) => {
    postMessageToPlugin({
      type: 'remove-station-from-line',
      lineId,
      stationId
    });
  };

  const handleToggleStopsAt = (lineId: LineId, stationId: StationId, currentStopsAt: boolean) => {
    postMessageToPlugin({
      type: 'set-line-stops-at-station',
      lineId,
      stationId,
      stopsAt: !currentStopsAt
    });
  };

  const handleStartInsertion = (index: number) => {
    setIsAddingStations(true);
    setInsertionIndex(index);
    setStationPath([]);

    postMessageToPlugin({
      type: 'start-adding-stations-mode',
      lineId: currentEditingLineId!
    });
  };

  const handleFinishInsertion = () => {
    if (!currentEditingLineId || stationPath.length === 0 || insertionIndex === null) {
      return;
    }

    // Get current line data
    const currentStationIds = linePathData?.stationIds || [];

    // Insert new stations at the insertion index
    const newStationIds = [
      ...currentStationIds.slice(0, insertionIndex),
      ...stationPath.map(s => s.id),
      ...currentStationIds.slice(insertionIndex)
    ];

    // Create stopsAt array for the new stations
    const currentStopsAt = linePathData?.stopsAt || [];
    const newStopsAtArray = [
      ...currentStopsAt.slice(0, insertionIndex),
      ...stationPath.map(() => stopsAt),
      ...currentStopsAt.slice(insertionIndex)
    ];

    // Send updated path to plugin
    postMessageToPlugin({
      type: 'update-line-path',
      lineId: currentEditingLineId,
      stationIds: newStationIds,
      stopsAt: newStopsAtArray
    });

    // Clean up insertion state
    setIsAddingStations(false);
    setInsertionIndex(null);
    setStationPath([]);

    postMessageToPlugin({
      type: 'stop-adding-stations-mode'
    });

    // Refresh the line path data
    postMessageToPlugin({
      type: 'get-line-path',
      lineId: currentEditingLineId
    });
  };

  const handleCancelInsertion = () => {
    setIsAddingStations(false);
    setInsertionIndex(null);
    setStationPath([]);

    postMessageToPlugin({
      type: 'stop-adding-stations-mode'
    });
  };

  const handleClearPath = () => {
    setStationPath([]);
  };

  const showPath = currentEditingLineId && linePathData && linePathData.lineId === currentEditingLineId;
  const pathDisplay = stationPath.length === 0
    ? 'None'
    : stationPath.map((station, idx) => `${idx + 1}. ${station.name}`).join(' → ');

  return (
    <div className="section">
      <h3>Edit Line Path</h3>
      <div className="grid">
        <div>
          <label htmlFor="edit-line-select">Select Line to Edit</label>
          <select
            className="input"
            id="edit-line-select"
            value={currentEditingLineId ?? ''}
            onChange={(e) => handleLineChange(e.target.value as LineId)}
          >
            <option value="">Choose a line...</option>
            {lines.map(line => (
              <option key={line.id} value={line.id}>{line.name}</option>
            ))}
          </select>
        </div>
        {showPath && !isAddingStations && (
          <div>
            <label>Current Path (☑ = stops, ☐ = passes by)</label>
            <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
              {/* Add stations button at the beginning */}
              <div style={{ textAlign: 'center', margin: '4px 0' }}>
                <button
                  className="button button--secondary"
                  onClick={() => handleStartInsertion(0)}
                  style={{ fontSize: '11px', padding: '4px 8px' }}
                >
                  + Add stations here
                </button>
              </div>

              {linePathData.stationIds.length === 0 ? (
                <p style={{ color: '#666', fontSize: '11px', padding: '8px' }}>
                  No stations in path
                </p>
              ) : (
                linePathData.stationIds.map((stationId, index) => {
                  const stopsAtStation = linePathData.stopsAt[index];
                  return (
                    <React.Fragment key={`${stationId}-${index}`}>
                      <div className="station-path-item">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className="station-number">{index + 1}</span>
                          <input
                            type="checkbox"
                            checked={stopsAtStation}
                            onChange={() => handleToggleStopsAt(linePathData.lineId, stationId, stopsAtStation)}
                            title={stopsAtStation ? "Line stops at this station" : "Line passes by this station"}
                          />
                          <span style={{ opacity: stopsAtStation ? 1 : 0.6 }}>
                            {linePathData.stationNames[index]}
                          </span>
                        </div>
                        <button
                          className="button button--secondary small-btn"
                          onClick={() => handleRemoveStation(linePathData.lineId, stationId)}
                        >
                          X
                        </button>
                      </div>

                      {/* Add stations button after each station */}
                      <div style={{ textAlign: 'center', margin: '4px 0' }}>
                        <button
                          className="button button--secondary"
                          onClick={() => handleStartInsertion(index + 1)}
                          style={{ fontSize: '11px', padding: '4px 8px' }}
                        >
                          + Add stations here
                        </button>
                      </div>
                    </React.Fragment>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Station insertion mode UI */}
        {showPath && isAddingStations && (
          <>
            <div>
              <p style={{ fontSize: '11px', color: '#666', margin: 0 }}>
                <strong>Inserting at position {insertionIndex! + 1}</strong><br />
                1. Click stations on canvas in order<br />
                2. Toggle "stops at" if needed<br />
                3. Click "Finish" when done
              </p>
            </div>
            <div style={{ fontSize: '11px', padding: '8px', background: '#f5f5f5', borderRadius: '4px', minHeight: '40px' }}>
              <strong>New stations:</strong> <span>{pathDisplay}</span>
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
                onClick={handleFinishInsertion}
                disabled={stationPath.length === 0}
              >
                Finish
              </button>
              <button
                className="button button--secondary"
                onClick={handleCancelInsertion}
              >
                Cancel
              </button>
            </div>
            <button
              className="button button--secondary full-width"
              onClick={handleClearPath}
              disabled={stationPath.length === 0}
            >
              Clear Path
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default EditLinePathSection;
