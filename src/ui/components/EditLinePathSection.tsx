import React, { useState, useEffect, useRef } from 'react';
import { LineId, StationId } from '../../common/types';
import { postMessageToPlugin } from '../figma';
import { LineData } from '../../common/messages';
import { FigmaPluginMessageManager } from '../events';

const AddStationsHereButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <div style={{ textAlign: 'center', margin: '4px 0' }}>
    <button
      className="button button--secondary"
      onClick={onClick}
      style={{ fontSize: '11px', padding: '4px 8px' }}
    >
      + Add stations here
    </button>
  </div>
);

const StationPathItem: React.FC<{
  name: string;
  index: number;
  stopsAt: boolean;
  onToggleStopsAt: () => void;
  onRemove: () => void;
}> = ({ name, index, stopsAt, onToggleStopsAt, onRemove }) => (
  <div className="station-path-item" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      <span className="station-number" style={{ paddingLeft: '4px', paddingRight: '4px' }}>{index + 1}</span>
      <input
        type="checkbox"
        checked={stopsAt}
        onChange={onToggleStopsAt}
        title={stopsAt ? "Line stops at this station" : "Line passes by this station"}
        width={16} height={16}
      />
    </div>
    <span style={{ opacity: stopsAt ? 1 : 0.6 }}>
      {name}
    </span>
    <button
      className="button button--secondary small-btn"
      onClick={onRemove}
    >
      X
    </button>
  </div>
);

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
  const [stationPath, setStationPath] = useState<{ id: StationId, name: string, stopsAt: boolean }[]>([]);

  // Use refs to track current state in event handlers
  const isAddingStationsRef = useRef(isAddingStations);
  const currentEditingLineIdRef = useRef(currentEditingLineId);

  useEffect(() => {
    isAddingStationsRef.current = isAddingStations;
  }, [isAddingStations]);

  useEffect(() => {
    currentEditingLineIdRef.current = currentEditingLineId;
  }, [currentEditingLineId]);

  // Set up message listeners once on mount
  useEffect(() => {
    const unsubscribe1 = messageManagerRef.current.onMessage('station-removed-from-line', () => {
      const lineId = currentEditingLineIdRef.current;
      if (lineId) {
        postMessageToPlugin({
          type: 'get-line-path',
          lineId
        });
      }
    });

    const unsubscribe2 = messageManagerRef.current.onMessage('toggle-stops-at', msg => {
      // After toggling, request fresh line path data
      if (currentEditingLineIdRef.current === msg.lineId) {
        postMessageToPlugin({
          type: 'get-line-path',
          lineId: msg.lineId
        });
      }
    });

    const unsubscribe3 = messageManagerRef.current.onMessage('line-path-data', msg => {
      setLinePathData(msg);
    });

    const unsubscribe4 = messageManagerRef.current.onMessage('station-clicked', msg => {
      if (isAddingStationsRef.current) {
        // Allow adding the same station multiple times for circular routes
        // Default to stops at this station
        setStationPath(prev => [...prev, { id: msg.stationId, name: msg.stationName, stopsAt: true }]);
      }
    });

    // Cleanup function to unsubscribe all listeners
    return () => {
      unsubscribe1();
      unsubscribe2();
      unsubscribe3();
      unsubscribe4();
    };
  }, []); // Only run once on mount

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

  const handleRemoveStation = (lineId: LineId, stationId: StationId, lineIndex: number) => {
    postMessageToPlugin({
      type: 'remove-station-from-line',
      lineId,
      stationId,
      lineIndex
    });
  };

  const handleToggleStopsAt = (lineId: LineId, stationId: StationId, lineIndex: number, currentStopsAt: boolean) => {
    postMessageToPlugin({
      type: 'set-line-stops-at-station',
      lineId,
      stationId,
      lineIndex,
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

    // Create stopsAt array using individual stopsAt values for each station
    const currentStopsAt = linePathData?.stopsAt || [];
    const newStopsAtArray = [
      ...currentStopsAt.slice(0, insertionIndex),
      ...stationPath.map(s => s.stopsAt),
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

  const handleToggleStationStopsAt = (index: number) => {
    setStationPath(prev => prev.map((station, i) =>
      i === index ? { ...station, stopsAt: !station.stopsAt } : station
    ));
  };

  const showPath = currentEditingLineId && linePathData && linePathData.lineId === currentEditingLineId;

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
              <AddStationsHereButton onClick={() => handleStartInsertion(0)} />

              {linePathData.stationIds.length === 0 ? (
                <p style={{ color: '#666', fontSize: '11px', padding: '8px' }}>
                  No stations in path
                </p>
              ) : (
                linePathData.stationIds.map((stationId, index) => (
                  <React.Fragment key={`${stationId}-${index}`}>
                    <StationPathItem
                      name={linePathData.stationNames[index]}
                      index={index}
                      stopsAt={linePathData.stopsAt[index]}
                      onToggleStopsAt={() => handleToggleStopsAt(linePathData.lineId, stationId, index, linePathData.stopsAt[index])}
                      onRemove={() => handleRemoveStation(linePathData.lineId, stationId, index)}
                    />
                    <AddStationsHereButton onClick={() => handleStartInsertion(index + 1)} />
                  </React.Fragment>
                ))
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
                2. Toggle "stops at" for each station if needed<br />
                3. Click "Finish" when done
              </p>
            </div>
            <div>
              <label>New stations (☑ = stops, ☐ = passes by)</label>
              <div style={{ maxHeight: '150px', overflowY: 'auto', padding: '8px', background: '#f5f5f5', borderRadius: '4px' }}>
                {stationPath.length === 0 ? (
                  <p style={{ color: '#666', fontSize: '11px', margin: 0 }}>
                    No stations selected yet
                  </p>
                ) : (
                  stationPath.map((station, index) => (
                    <StationPathItem
                      key={`${station.id}-${index}`}
                      name={station.name}
                      index={index}
                      stopsAt={station.stopsAt}
                      onToggleStopsAt={() => handleToggleStationStopsAt(index)}
                      onRemove={() => setStationPath(prev => prev.filter((_, i) => i !== index))}
                    />
                  ))
                )}
              </div>
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
