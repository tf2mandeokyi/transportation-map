import React, { useEffect, useRef, useState } from 'react';
import { StationId } from '@/common/types';
import { postMessageToPlugin } from '../figma';
import { LineData, LinePathInput } from '@/common/messages';
import { LinePath, StationStop } from '@/plugin/models/structures';
import { useLinesContext } from '../contexts/LinesContext';
import { useNetworkContext } from '../contexts/NetworkContext';
import { useMessageManager } from '../contexts/MessageContext';

// ─── Sub-components ────────────────────────────────────────────────────────

const LineInfoEditor: React.FC<{
  line: LineData;
  onUpdateName: (name: string) => void;
  onUpdateColor: (color: string) => void;
}> = ({ line, onUpdateName, onUpdateColor }) => (
  <div className="grid">
    <div className="two-column">
      <div>
        <label htmlFor="edit-line-name">Line Name</label>
        <input className="input" id="edit-line-name" type="text" value={line.name} onChange={(e) => onUpdateName(e.target.value)} />
      </div>
      <div>
        <label htmlFor="edit-line-color">Color</label>
        <input className="input" id="edit-line-color" type="color" value={line.color} onChange={(e) => onUpdateColor(e.target.value)} />
      </div>
    </div>
  </div>
);

interface StationPathItemProps {
  name: string;
  index: number;
  onRemove: () => void;
  onSelect?: () => void;
}

const StationPathItem: React.FC<StationPathItemProps> = ({ name, index, onRemove, onSelect }) => (
  <div className="station-path-item" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
    <span className="station-number" style={{ paddingLeft: '4px', paddingRight: '4px' }}>{index + 1}</span>
    <span style={{ flex: 1, cursor: onSelect ? 'pointer' : 'default' }} onClick={onSelect}>{name}</span>
    <button className="button button--secondary small-btn" onClick={onRemove}>X</button>
  </div>
);

const AddHereButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '2px 0' }}>
    <div style={{ flex: 1, height: '1px', background: '#d0d0d0' }} />
    <button
      className="button button--secondary"
      style={{ fontSize: '10px', padding: '2px 8px', lineHeight: '14px' }}
      onClick={onClick}
    >
      + Add Here
    </button>
    <div style={{ flex: 1, height: '1px', background: '#d0d0d0' }} />
  </div>
);

// ─── Main component ────────────────────────────────────────────────────────

const EditLinePathSection: React.FC = () => {
  const { lines, currentEditingLineId, setCurrentEditingLineId } = useLinesContext();
  const { roads } = useNetworkContext();
  const manager = useMessageManager();

  const [linePaths, setLinePaths]           = useState<LinePath[]>([]);
  const [stationNames, setStationNames]     = useState<Record<string, string>>({});
  const [isAddingStations, setIsAddingStations] = useState(false);
  const [pendingStations, setPendingStations]   = useState<Array<{ id: StationId; name: string }>>([]);
  // -1 = insert before all stops; N = insert after stop N; null = not in insert mode
  const [insertAfterStopIndex, setInsertAfterStopIndex] = useState<number | null>(null);

  const isAddingRef        = useRef(isAddingStations);
  const currentLineIdRef   = useRef(currentEditingLineId);
  useEffect(() => { isAddingRef.current = isAddingStations; }, [isAddingStations]);
  useEffect(() => { currentLineIdRef.current = currentEditingLineId; }, [currentEditingLineId]);

  useEffect(() => {
    const unsub1 = manager.onMessage('line-path-data', msg => {
      setLinePaths(msg.paths);
      setStationNames(msg.stationNames);
    });
    const unsub2 = manager.onMessage('station-removed-from-line', () => {
      const lineId = currentLineIdRef.current;
      if (lineId) postMessageToPlugin({ type: 'get-line-path', lineId });
    });
    const unsub3 = manager.onMessage('station-clicked', msg => {
      if (isAddingRef.current) {
        setPendingStations(prev => [...prev, { id: msg.stationId, name: msg.stationName }]);
      }
    });
    return () => { unsub1(); unsub2(); unsub3(); };
  }, [manager]);

  useEffect(() => {
    if (currentEditingLineId) {
      postMessageToPlugin({ type: 'get-line-path', lineId: currentEditingLineId });
    }
  }, [currentEditingLineId]);

  const handleStartAdding = (afterStopIndex: number) => {
    setInsertAfterStopIndex(afterStopIndex);
    setIsAddingStations(true);
    setPendingStations([]);
    if (currentEditingLineId) {
      postMessageToPlugin({ type: 'start-adding-stations-mode', lineId: currentEditingLineId });
    }
  };

  const handleFinishAdding = () => {
    if (!currentEditingLineId || pendingStations.length === 0) return;
    const existingStops = linePaths
      .filter((p): p is StationStop => p.kind === 'station-stop')
      .map(p => ({ kind: 'station-stop' as const, stationId: p.stationId }));
    const newStopInputs: LinePathInput[] = pendingStations.map(s => ({ kind: 'station-stop' as const, stationId: s.id }));

    let newPaths: LinePathInput[];
    if (insertAfterStopIndex === null || insertAfterStopIndex === existingStops.length - 1) {
      newPaths = [...existingStops, ...newStopInputs];
    } else if (insertAfterStopIndex === -1) {
      newPaths = [...newStopInputs, ...existingStops];
    } else {
      newPaths = [
        ...existingStops.slice(0, insertAfterStopIndex + 1),
        ...newStopInputs,
        ...existingStops.slice(insertAfterStopIndex + 1),
      ];
    }

    postMessageToPlugin({ type: 'update-line-path', lineId: currentEditingLineId, paths: newPaths });
    postMessageToPlugin({ type: 'stop-adding-stations-mode' });
    postMessageToPlugin({ type: 'get-line-path', lineId: currentEditingLineId });
    setIsAddingStations(false);
    setPendingStations([]);
    setInsertAfterStopIndex(null);
  };

  const handleCancelAdding = () => {
    setIsAddingStations(false);
    setPendingStations([]);
    setInsertAfterStopIndex(null);
    postMessageToPlugin({ type: 'stop-adding-stations-mode' });
  };

  const handleRemovePath = (pathIndex: number) => {
    if (!currentEditingLineId) return;
    postMessageToPlugin({ type: 'remove-station-from-line', lineId: currentEditingLineId, pathIndex });
  };

  const handleRotatePath = (steps: number) => {
    if (!currentEditingLineId) return;
    postMessageToPlugin({ type: 'rotate-line-path', lineId: currentEditingLineId, steps });
    postMessageToPlugin({ type: 'get-line-path', lineId: currentEditingLineId });
  };

  const currentLine = lines.find(l => l.id === currentEditingLineId);

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
            {!isAddingStations && <AddHereButton onClick={() => handleStartAdding(-1)} />}
          </div>
        ) : (
          <div>
            {(() => {
              const elements: React.ReactNode[] = [];
              let stopCount = 0;
              if (!isAddingStations) {
                elements.push(<AddHereButton key="add-before-0" onClick={() => handleStartAdding(-1)} />);
              }
              for (let i = 0; i < linePaths.length; i++) {
                const path = linePaths[i];
                if (path.kind === 'station-stop') {
                  const sName = stationNames[path.stationId] ?? path.stationId;
                  const currentStopIndex = stopCount;
                  elements.push(
                    <StationPathItem
                      key={`${path.stationId}-${i}`}
                      name={sName}
                      index={i}
                      onRemove={() => handleRemovePath(path.index)}
                      onSelect={() => postMessageToPlugin({ type: 'select-station', stationId: path.stationId })}
                    />
                  );
                  stopCount++;
                  // If no RSE follows, add "Add Here" right after this stop
                  const nextPath = linePaths[i + 1];
                  if (!isAddingStations && (!nextPath || nextPath.kind === 'station-stop')) {
                    elements.push(<AddHereButton key={`add-after-stop-${currentStopIndex}`} onClick={() => handleStartAdding(currentStopIndex)} />);
                  }
                } else {
                  const destRoad = roads.find(r => r.id === path.destRoadId);
                  const label = destRoad?.name ?? path.destRoadId;
                  elements.push(
                    <div key={`road-${i}`} className="station-path-item" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="station-number">{i + 1}</span>
                      <span style={{ flex: 1, fontStyle: 'italic', color: '#666' }}>↪ {label}</span>
                    </div>
                  );
                  // RSE always precedes the next stop; "Add Here" goes after the RSE
                  if (!isAddingStations) {
                    elements.push(<AddHereButton key={`add-before-stop-${stopCount}`} onClick={() => handleStartAdding(stopCount - 1)} />);
                  }
                }
              }
              return elements;
            })()}
          </div>
        )}

        {isAddingStations ? (
          <div style={{ padding: '12px', background: '#f5f5f5', borderRadius: '4px', border: '2px solid #18a0fb', marginTop: '8px' }}>
            <p style={{ fontSize: '11px', color: '#666', margin: '0 0 8px 0' }}>
              <strong>Adding stations mode</strong><br />
              Click stations on the canvas to add them to the path.
            </p>
            {pendingStations.length > 0 && (
              <div style={{ marginBottom: '8px' }}>
                {pendingStations.map((s, i) => (
                  <div key={`${s.id}-${i}`} style={{ fontSize: '11px', padding: '2px 0' }}>{i + 1}. {s.name}</div>
                ))}
              </div>
            )}
            <div className="two-column">
              <button className="button button--primary" onClick={handleFinishAdding} disabled={pendingStations.length === 0}>Finish</button>
              <button className="button button--secondary" onClick={handleCancelAdding}>Cancel</button>
            </div>
          </div>
        ) : (
          linePaths.length > 1 && (
            <div style={{ marginTop: '4px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button className="button button--secondary" onClick={() => handleRotatePath(1)} title="Rotate path by 1">↻</button>
            </div>
          )
        )}
      </div>
    </div>
  );
};

export default EditLinePathSection;
