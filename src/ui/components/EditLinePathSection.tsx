import React, { useState, useEffect, useRef } from 'react';
import { LineId, StationId } from '../../common/types';
import { postMessageToPlugin } from '../figma';
import { LineData } from '../../common/messages';
import { LinePath } from '../../plugin/models/structures';
import { LinePathInput } from '../../common/messages';
import { FigmaPluginMessageManager } from '../events';

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

interface Props {
  lines: LineData[];
  messageManagerRef: React.RefObject<FigmaPluginMessageManager>;
  currentEditingLineId: LineId | null;
  onBack: () => void;
}

const EditLinePathSection: React.FC<Props> = ({ lines, messageManagerRef, currentEditingLineId, onBack }) => {
  const [linePaths, setLinePaths] = useState<LinePath[]>([]);
  const [stationNames, setStationNames] = useState<Record<string, string>>({});
  const [isAddingStations, setIsAddingStations] = useState(false);
  const [pendingStations, setPendingStations] = useState<Array<{ id: StationId; name: string }>>([]);

  const isAddingRef = useRef(isAddingStations);
  const currentLineIdRef = useRef(currentEditingLineId);

  useEffect(() => { isAddingRef.current = isAddingStations; }, [isAddingStations]);
  useEffect(() => { currentLineIdRef.current = currentEditingLineId; }, [currentEditingLineId]);

  useEffect(() => {
    const unsubscribe1 = messageManagerRef.current.onMessage('line-path-data', msg => {
      setLinePaths(msg.paths);
      setStationNames(msg.stationNames as Record<string, string>);
    });

    const unsubscribe2 = messageManagerRef.current.onMessage('station-removed-from-line', () => {
      const lineId = currentLineIdRef.current;
      if (lineId) postMessageToPlugin({ type: 'get-line-path', lineId });
    });

    const unsubscribe3 = messageManagerRef.current.onMessage('station-clicked', msg => {
      if (isAddingRef.current) {
        setPendingStations(prev => [...prev, { id: msg.stationId, name: msg.stationName }]);
      }
    });

    return () => { unsubscribe1(); unsubscribe2(); unsubscribe3(); };
  }, []);

  useEffect(() => {
    if (currentEditingLineId) {
      postMessageToPlugin({ type: 'get-line-path', lineId: currentEditingLineId });
    }
  }, [currentEditingLineId]);

  const handleStartAdding = () => {
    setIsAddingStations(true);
    setPendingStations([]);
    if (currentEditingLineId) {
      postMessageToPlugin({ type: 'start-adding-stations-mode', lineId: currentEditingLineId });
    }
  };

  const handleFinishAdding = () => {
    if (!currentEditingLineId || pendingStations.length === 0) return;

    const newPaths: LinePathInput[] = [
      ...linePaths.map(p => p.kind === 'station-stop'
        ? { kind: 'station-stop' as const, stationId: p.stationId }
        : { kind: 'road-section-enter' as const, roadSectionId: p.roadSectionId }
      ),
      ...pendingStations.map(s => ({ kind: 'station-stop' as const, stationId: s.id }))
    ];

    postMessageToPlugin({ type: 'update-line-path', lineId: currentEditingLineId, paths: newPaths });
    postMessageToPlugin({ type: 'stop-adding-stations-mode' });
    postMessageToPlugin({ type: 'get-line-path', lineId: currentEditingLineId });

    setIsAddingStations(false);
    setPendingStations([]);
  };

  const handleCancelAdding = () => {
    setIsAddingStations(false);
    setPendingStations([]);
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

  const handleSelectStation = (stationId: StationId) => {
    postMessageToPlugin({ type: 'select-station', stationId });
  };

  const currentLine = lines.find(l => l.id === currentEditingLineId);

  return (
    <div className="section">
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <button className="button button--secondary" onClick={onBack} style={{ padding: '8px 12px' }}>
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
          <p style={{ color: '#666', fontSize: '11px', padding: '8px' }}>No stops in path</p>
        ) : (
          <div>
            {linePaths.map((path, i) => {
              if (path.kind === 'station-stop') {
                const sName = stationNames[path.stationId] ?? path.stationId;
                return (
                  <StationPathItem
                    key={`${path.stationId}-${i}`}
                    name={sName}
                    index={i}
                    onRemove={() => handleRemovePath(path.index)}
                    onSelect={() => handleSelectStation(path.stationId)}
                  />
                );
              }
              return (
                <div key={`road-${i}`} className="station-path-item" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="station-number">{i + 1}</span>
                  <span style={{ flex: 1, fontStyle: 'italic', color: '#666' }}>Road Section: {path.roadSectionId}</span>
                  <button className="button button--secondary small-btn" onClick={() => handleRemovePath(path.index)}>X</button>
                </div>
              );
            })}
          </div>
        )}

        {!isAddingStations ? (
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            <button className="button button--secondary" style={{ flex: 1 }} onClick={handleStartAdding}>
              + Add Stations
            </button>
            {linePaths.length > 1 && (
              <button className="button button--secondary" onClick={() => handleRotatePath(1)} title="Rotate path by 1">
                ↻
              </button>
            )}
          </div>
        ) : (
          <div style={{ padding: '12px', background: '#f5f5f5', borderRadius: '4px', border: '2px solid #18a0fb', marginTop: '8px' }}>
            <p style={{ fontSize: '11px', color: '#666', margin: '0 0 8px 0' }}>
              <strong>Adding stations mode</strong><br />
              Click stations on the canvas to add them to the path.
            </p>
            {pendingStations.length > 0 && (
              <div style={{ marginBottom: '8px' }}>
                {pendingStations.map((s, i) => (
                  <div key={`${s.id}-${i}`} style={{ fontSize: '11px', padding: '2px 0' }}>
                    {i + 1}. {s.name}
                  </div>
                ))}
              </div>
            )}
            <div className="two-column">
              <button className="button button--primary" onClick={handleFinishAdding} disabled={pendingStations.length === 0}>
                Finish
              </button>
              <button className="button button--secondary" onClick={handleCancelAdding}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EditLinePathSection;
