import React, { useState, useEffect, useRef } from 'react';
import { LineId, StationId } from '../../common/types';
import { postMessageToPlugin } from '../figma';
import { LineData } from '../../common/messages';
import { FigmaPluginMessageManager } from '../events';

const InBetweenStationButtons: React.FC<{
  onAdd: () => void,
  onRotate?: () => void
}> = ({ onAdd, onRotate }) => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '4px' }}>
    <button
      className="button button--secondary"
      onClick={onAdd}
      style={{ fontSize: '14px', padding: '2px 10px', minWidth: '30px', lineHeight: '1' }}
      title="Add stations here"
    >
      +
    </button>
    {onRotate && (
      <button
        className="button button--secondary"
        onClick={onRotate}
        style={{ fontSize: '14px', padding: '2px 10px', minWidth: '30px', lineHeight: '1' }}
        title="Rotate line path (move next station to start)"
      >
        ↻
      </button>
    )}
  </div>
);

const StationPathItem: React.FC<{
  name: string;
  index: number;
  stopsAt: boolean;
  onToggleStopsAt: () => void;
  onRemove: () => void;
  onSelect?: () => void;
  isHighlighted?: boolean;
}> = ({ name, index, stopsAt, onToggleStopsAt, onRemove, onSelect, isHighlighted }) => (
  <div
    className="station-path-item"
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      backgroundColor: isHighlighted ? '#e3f2fd' : 'transparent',
      border: isHighlighted ? '2px solid #18a0fb' : '2px solid transparent',
      borderRadius: '4px',
      transition: 'all 0.2s ease'
    }}
  >
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
    <span
      style={{
        opacity: stopsAt ? 1 : 0.6,
        cursor: onSelect ? 'pointer' : 'default',
        flex: 1
      }}
      onClick={onSelect}
      title={onSelect ? "Click to select on canvas" : undefined}
    >
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

const InsertionUI: React.FC<{
  insertionIndex: number;
  stationPath: Array<{ id: StationId, name: string, stopsAt: boolean }>;
  onToggleStopsAt: (index: number) => void;
  onRemoveStation: (index: number) => void;
  onFinish: () => void;
  onClear: () => void;
  onCancel: () => void;
}> = ({ insertionIndex, stationPath, onToggleStopsAt, onRemoveStation, onFinish, onClear, onCancel }) => (
  <div style={{ margin: '8px 0', padding: '12px', background: '#f5f5f5', borderRadius: '4px', border: '2px solid #18a0fb' }}>
    <p style={{ fontSize: '11px', color: '#666', margin: '0 0 8px 0' }}>
      <strong>Inserting at position {insertionIndex + 1}</strong><br />
      1. Click stations on canvas in order<br />
      2. Toggle "stops at" for each station if needed<br />
      3. Click "Finish" when done
    </p>
    <div style={{ marginBottom: '8px' }}>
      <label style={{ fontSize: '11px', fontWeight: 'bold' }}>New stations (☑ = stops, ☐ = passes by)</label>
      <div style={{ padding: '8px', background: '#fff', borderRadius: '4px', marginTop: '4px' }}>
        {stationPath.length === 0 ? (
          <p style={{ color: '#666', fontSize: '11px', margin: 0 }}>
            No stations selected yet
          </p>
        ) : (
          stationPath.map((station, idx) => (
            <StationPathItem
              key={`${station.id}-${idx}`}
              name={station.name}
              index={idx}
              stopsAt={station.stopsAt}
              onToggleStopsAt={() => onToggleStopsAt(idx)}
              onRemove={() => onRemoveStation(idx)}
            />
          ))
        )}
      </div>
    </div>
    <div className="two-column" style={{ marginBottom: '4px' }}>
      <button
        className="button button--primary"
        onClick={onFinish}
        disabled={stationPath.length === 0}
      >
        Finish
      </button>
      <button
        className="button button--secondary"
        onClick={onClear}
        disabled={stationPath.length === 0}
      >
        Clear
      </button>
    </div>
    <button
      className="button button--secondary full-width"
      onClick={onCancel}
    >
      Cancel
    </button>
  </div>
);

const LineInfoEditor: React.FC<{
  line: LineData;
  onUpdateName: (name: string) => void;
  onUpdateColor: (color: string) => void;
}> = ({ line, onUpdateName, onUpdateColor }) => (
  <div className="grid">
    <div className="two-column">
      <div>
        <label htmlFor="edit-line-name">Line Name</label>
        <input
          className="input"
          id="edit-line-name"
          type="text"
          value={line.name}
          onChange={(e) => onUpdateName(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="edit-line-color">Color</label>
        <input
          className="input"
          id="edit-line-color"
          type="color"
          value={line.color}
          onChange={(e) => onUpdateColor(e.target.value)}
        />
      </div>
    </div>
  </div>
);

const StationPathList: React.FC<{
  linePathData: { lineId: LineId; stationIds: StationId[]; stationNames: string[]; stopsAt: boolean[] };
  isAddingStations: boolean;
  insertionIndex: number | null;
  stationPath: Array<{ id: StationId, name: string, stopsAt: boolean }>;
  highlightedStationId: StationId | null;
  onStartInsertion: (index: number) => void;
  onToggleStationStopsAt: (index: number) => void;
  onRemoveFromPath: (index: number) => void;
  onFinishInsertion: () => void;
  onClearPath: () => void;
  onCancelInsertion: () => void;
  onRotatePath: (steps: number) => void;
}> = ({
  linePathData,
  isAddingStations,
  insertionIndex,
  stationPath,
  highlightedStationId,
  onStartInsertion,
  onToggleStationStopsAt,
  onRemoveFromPath,
  onFinishInsertion,
  onClearPath,
  onCancelInsertion,
  onRotatePath
}) => {
  // Define message-sending functions locally
  const handleToggleStopsAt = (lineId: LineId, stationId: StationId, lineIndex: number, currentStopsAt: boolean) => {
    postMessageToPlugin({
      type: 'set-line-stops-at-station',
      lineId,
      stationId,
      lineIndex,
      stopsAt: !currentStopsAt
    });
  };

  const handleRemoveStation = (lineId: LineId, stationId: StationId, lineIndex: number) => {
    postMessageToPlugin({
      type: 'remove-station-from-line',
      lineId,
      stationId,
      lineIndex
    });
  };

  const handleSelectStation = (stationId: StationId) => {
    postMessageToPlugin({
      type: 'select-station',
      stationId
    });
  };

  return (
    <div>
      <label>Current Path (☑ = stops, ☐ = passes by)</label>
      <div>
        {/* Add stations button or insertion UI at position 0 */}
        {isAddingStations && insertionIndex === 0 ? (
          <InsertionUI
            insertionIndex={insertionIndex}
            stationPath={stationPath}
            onToggleStopsAt={onToggleStationStopsAt}
            onRemoveStation={onRemoveFromPath}
            onFinish={onFinishInsertion}
            onClear={onClearPath}
            onCancel={onCancelInsertion}
          />
        ) : (
          !isAddingStations && <InBetweenStationButtons onAdd={() => onStartInsertion(0)} />
        )}

        {linePathData.stationIds.length === 0 ? (
          <p style={{ color: '#666', fontSize: '11px', padding: '8px' }}>
            No stations in path
          </p>
        ) : (
          linePathData.stationIds.map((stationId, index) => {
            // Highlight the first occurrence of the station in the path
            const isFirstOccurrence = linePathData.stationIds.indexOf(stationId) === index;
            const isHighlighted = isFirstOccurrence && highlightedStationId === stationId;

            return (
              <React.Fragment key={`${stationId}-${index}`}>
                <StationPathItem
                  name={linePathData.stationNames[index]}
                  index={index}
                  stopsAt={linePathData.stopsAt[index]}
                  onToggleStopsAt={() => handleToggleStopsAt(linePathData.lineId, stationId, index, linePathData.stopsAt[index])}
                  onRemove={() => handleRemoveStation(linePathData.lineId, stationId, index)}
                  onSelect={() => handleSelectStation(stationId)}
                  isHighlighted={isHighlighted}
                />

                {/* Add stations button, rotate button, or insertion UI at position index + 1 */}
                {isAddingStations && insertionIndex === index + 1 ? (
                  <InsertionUI
                    insertionIndex={insertionIndex}
                    stationPath={stationPath}
                    onToggleStopsAt={onToggleStationStopsAt}
                    onRemoveStation={onRemoveFromPath}
                    onFinish={onFinishInsertion}
                    onClear={onClearPath}
                    onCancel={onCancelInsertion}
                  />
                ) : (
                  !isAddingStations && (
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: '4px' }}>
                      <InBetweenStationButtons
                        onAdd={() => onStartInsertion(index + 1)}
                        onRotate={index < linePathData.stationIds.length - 1 ? () => onRotatePath(index + 1) : undefined}
                      />
                    </div>
                  )
                )}
              </React.Fragment>
            );
          })
        )}
      </div>
    </div>
  );
};

interface Props {
  lines: LineData[];
  messageManagerRef: React.RefObject<FigmaPluginMessageManager>;
  currentEditingLineId: LineId | null;
  onBack: () => void;
}

const EditLinePathSection: React.FC<Props> = ({
  lines,
  messageManagerRef,
  currentEditingLineId,
  onBack
}) => {
  const [linePathData, setLinePathData] = useState<{ lineId: LineId; stationIds: StationId[]; stationNames: string[]; stopsAt: boolean[] } | null>(null);

  // Station insertion state
  const [isAddingStations, setIsAddingStations] = useState(false);
  const [insertionIndex, setInsertionIndex] = useState<number | null>(null);
  const [stationPath, setStationPath] = useState<{ id: StationId, name: string, stopsAt: boolean }[]>([]);

  // Highlighted station state (when clicked from canvas)
  const [highlightedStationId, setHighlightedStationId] = useState<StationId | null>(null);

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
      } else if (currentEditingLineIdRef.current) {
        // When not in adding mode but editing a line, highlight the station
        setHighlightedStationId(msg.stationId);
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

  // Watch for changes to currentEditingLineId from parent
  useEffect(() => {
    if (currentEditingLineId) {
      postMessageToPlugin({
        type: 'get-line-path',
        lineId: currentEditingLineId
      });
    }
  }, [currentEditingLineId]);

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

  const handleUpdateLineName = (newName: string) => {
    if (currentEditingLineId && newName.trim()) {
      postMessageToPlugin({
        type: 'update-line-name',
        lineId: currentEditingLineId,
        name: newName.trim()
      });
    }
  };

  const handleUpdateLineColor = (newColor: string) => {
    if (currentEditingLineId) {
      postMessageToPlugin({
        type: 'update-line-color',
        lineId: currentEditingLineId,
        color: newColor
      });
    }
  };

  const handleRotatePath = (steps: number) => {
    if (!currentEditingLineId) return;

    postMessageToPlugin({
      type: 'rotate-line-path',
      lineId: currentEditingLineId,
      steps
    });

    // Refresh the line path data
    postMessageToPlugin({
      type: 'get-line-path',
      lineId: currentEditingLineId
    });
  };

  const currentLine = lines.find(line => line.id === currentEditingLineId);
  const showPath = currentEditingLineId && linePathData && linePathData.lineId === currentEditingLineId;

  return (
    <div className="section">
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <button
          className="button button--secondary"
          onClick={onBack}
          style={{ padding: '8px 12px' }}
        >
          &lt; Back
        </button>
        <h3 style={{ margin: 0, flex: 1 }}>Edit Line Path</h3>
      </div>

      {currentLine && (
        <LineInfoEditor
          line={currentLine}
          onUpdateName={handleUpdateLineName}
          onUpdateColor={handleUpdateLineColor}
        />
      )}

      <div className="grid">
        {showPath && (
          <StationPathList
            linePathData={linePathData}
            isAddingStations={isAddingStations}
            insertionIndex={insertionIndex}
            stationPath={stationPath}
            highlightedStationId={highlightedStationId}
            onStartInsertion={handleStartInsertion}
            onToggleStationStopsAt={handleToggleStationStopsAt}
            onRemoveFromPath={(idx) => setStationPath(prev => prev.filter((_, i) => i !== idx))}
            onFinishInsertion={handleFinishInsertion}
            onClearPath={handleClearPath}
            onCancelInsertion={handleCancelInsertion}
            onRotatePath={handleRotatePath}
          />
        )}
      </div>
    </div>
  );
};

export default EditLinePathSection;
