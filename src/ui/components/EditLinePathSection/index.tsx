import React from 'react';
import { postMessageToPlugin } from '../../figma';
import { useLinesContext } from '../../contexts/LinesContext';
import { useEditLinePath } from './useEditLinePath';
import LineInfoEditor from './LineInfoEditor';
import PathItemsList from './PathItemsList';
import InsertionButtons from './InsertionButtons';
import StationAddingPanel from './StationAddingPanel';
import RseAddingPanel from './RseAddingPanel';

const EditLinePathSection: React.FC = () => {
  const { lines, currentEditingLineId, setCurrentEditingLineId } = useLinesContext();
  const {
    linePaths, stationNames, roads,
    isAddingStations, pendingStations,
    addingRseAfterPathIndex, rseError, rseNodeOptions, rsePendingRoadId, rseSelectedNodeId,
    setRseSelectedNodeId,
    handleStartAdding, handleFinishAdding, handleCancelAdding,
    startRseMode, stopRseMode, commitRseWithSelectedNode,
    handleRemovePath, handleRemoveRse, handleRotatePath,
  } = useEditLinePath();

  const currentLine = lines.find(l => l.id === currentEditingLineId);
  const inactive = !isAddingStations && addingRseAfterPathIndex === null;

  return (
    <div className="section">
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <button className="button button--secondary" onClick={() => setCurrentEditingLineId(null)} style={{ padding: '8px 12px' }}>
          &lt; Back
        </button>
        <h3 style={{ margin: 0, flex: 1 }}>Edit Line Path</h3>
      </div>

      {currentLine && (
        <LineInfoEditor
          line={currentLine}
          onUpdateName={(name) => {
            if (currentEditingLineId && name.trim()) {
              postMessageToPlugin({ type: 'update-line-name', lineId: currentEditingLineId, name: name.trim() });
            }
          }}
          onUpdateColor={(color) => {
            if (currentEditingLineId) {
              postMessageToPlugin({ type: 'update-line-color', lineId: currentEditingLineId, color });
            }
          }}
        />
      )}

      <div className="grid">
        <label>Current Path</label>

        {linePaths.length === 0 ? (
          <div>
            <p style={{ color: '#666', fontSize: '11px', padding: '8px' }}>No stops in path</p>
            {inactive && <InsertionButtons onAddStation={() => handleStartAdding(-1)} />}
          </div>
        ) : (
          <PathItemsList
            linePaths={linePaths}
            stationNames={stationNames}
            roads={roads}
            inactive={inactive}
            onRemoveStop={handleRemovePath}
            onRemoveRse={handleRemoveRse}
            onSelectStation={(stationId) => postMessageToPlugin({ type: 'select-station', stationId })}
            onStartAddingStation={handleStartAdding}
            onStartAddingRse={startRseMode}
          />
        )}

        {isAddingStations && (
          <StationAddingPanel
            pendingStations={pendingStations}
            onFinish={handleFinishAdding}
            onCancel={handleCancelAdding}
          />
        )}

        {addingRseAfterPathIndex !== null && (
          <RseAddingPanel
            rseError={rseError}
            rseNodeOptions={rseNodeOptions}
            rsePendingRoadId={rsePendingRoadId}
            rseSelectedNodeId={rseSelectedNodeId}
            onNodeSelect={setRseSelectedNodeId}
            onCommit={commitRseWithSelectedNode}
            onCancel={stopRseMode}
          />
        )}

        {inactive && linePaths.filter(p => p.kind === 'station-stop').length > 1 && (
          <div style={{ marginTop: '4px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button className="button button--secondary" onClick={() => handleRotatePath(1)} title="Rotate path by 1">↻</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default EditLinePathSection;
