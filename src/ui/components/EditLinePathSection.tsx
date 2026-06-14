import React, { useEffect, useRef, useState } from 'react';
import { NodeId, RoadId, StationId } from '@/common/types';
import { postMessageToPlugin } from '../figma';
import { LineData, LinePathInput } from '@/common/messages';
import { LinePath } from '@/plugin/models/structures';
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

const InsertionButtons: React.FC<{
  onAddStation?: () => void;
  onAddRse?: () => void;
}> = ({ onAddStation, onAddRse }) => {
  if (!onAddStation && !onAddRse) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '2px 0' }}>
      <div style={{ flex: 1, height: '1px', background: '#d0d0d0' }} />
      {onAddStation && (
        <button className="button button--secondary" style={{ fontSize: '10px', padding: '2px 6px', lineHeight: '14px' }} onClick={onAddStation}>
          + Station
        </button>
      )}
      {onAddRse && (
        <button className="button button--secondary" style={{ fontSize: '10px', padding: '2px 6px', lineHeight: '14px' }} onClick={onAddRse}>
          ↪ Road
        </button>
      )}
      <div style={{ flex: 1, height: '1px', background: '#d0d0d0' }} />
    </div>
  );
};

// ─── Main component ────────────────────────────────────────────────────────

const EditLinePathSection: React.FC = () => {
  const { lines, currentEditingLineId, setCurrentEditingLineId } = useLinesContext();
  const { roads, nodes } = useNetworkContext();
  const manager = useMessageManager();

  const [linePaths, setLinePaths]               = useState<LinePath[]>([]);
  const [stationNames, setStationNames]         = useState<Record<string, string>>({});
  const [stationRoadIds, setStationRoadIds]     = useState<Record<string, RoadId | null>>({});
  const [isAddingStations, setIsAddingStations] = useState(false);
  const [pendingStations, setPendingStations]   = useState<Array<{ id: StationId; name: string }>>([]);
  // -1 = insert before all; N = insert after linePaths[N]; null = not in insert mode
  const [insertAfterPathIndex, setInsertAfterPathIndex] = useState<number | null>(null);

  // RSE adding state
  // When non-null, we're in RSE canvas-click mode; value = path index to insert after
  const [addingRseAfterPathIndex, setAddingRseAfterPathIndex] = useState<number | null>(null);
  const [rseError, setRseError]                   = useState<string | null>(null);
  // Set when the clicked road connects via multiple nodes — user must pick one
  const [rseNodeOptions, setRseNodeOptions]       = useState<Array<{ nodeId: NodeId; nodeName: string }> | null>(null);
  const [rsePendingRoadId, setRsePendingRoadId]   = useState<RoadId | null>(null);
  const [rseSelectedNodeId, setRseSelectedNodeId] = useState<NodeId | ''>('');

  const isAddingRef        = useRef(isAddingStations);
  const addingRseRef       = useRef(addingRseAfterPathIndex);
  const currentLineIdRef   = useRef(currentEditingLineId);
  useEffect(() => { isAddingRef.current = isAddingStations; }, [isAddingStations]);
  useEffect(() => { addingRseRef.current = addingRseAfterPathIndex; }, [addingRseAfterPathIndex]);
  useEffect(() => { currentLineIdRef.current = currentEditingLineId; }, [currentEditingLineId]);

  // Keep refs for all values used inside message callbacks (avoid stale closures)
  const linePathsRef      = useRef(linePaths);
  const stationRoadIdsRef = useRef(stationRoadIds);
  const roadsRef          = useRef(roads);
  const nodesRef          = useRef(nodes);
  useEffect(() => { linePathsRef.current = linePaths; }, [linePaths]);
  useEffect(() => { stationRoadIdsRef.current = stationRoadIds; }, [stationRoadIds]);
  useEffect(() => { roadsRef.current = roads; }, [roads]);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);

  useEffect(() => {
    const unsub1 = manager.onMessage('line-path-data', msg => {
      setLinePaths(msg.paths);
      setStationNames(msg.stationNames);
      setStationRoadIds(msg.stationRoadIds);
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
    const unsub4 = manager.onMessage('road-clicked', msg => {
      const afterIndex = addingRseRef.current;
      if (afterIndex === null) return;
      handleRoadClicked(afterIndex, msg.roadId);
    });
    return () => { unsub1(); unsub2(); unsub3(); unsub4(); };
  }, [manager]);

  useEffect(() => {
    if (currentEditingLineId) {
      postMessageToPlugin({ type: 'get-line-path', lineId: currentEditingLineId });
    }
  }, [currentEditingLineId]);

  // ─── Helpers ───────────────────────────────────────────────────────────────

  const toLinePathInputs = (paths: LinePath[]): LinePathInput[] =>
    paths.map(p => p.kind === 'station-stop'
      ? { kind: 'station-stop' as const, stationId: p.stationId }
      : { kind: 'road-section-enter' as const, sourceRoadId: p.sourceRoadId, nodeId: p.nodeId, destRoadId: p.destRoadId }
    );

  // Returns the road ID the line is travelling on immediately after path index N.
  const getSourceRoadAt = (pathIndex: number): RoadId | null => {
    if (pathIndex < 0) return null;
    const paths = linePathsRef.current;
    const p = paths[pathIndex];
    if (!p) return null;
    if (p.kind === 'road-section-enter') return p.destRoadId;
    return stationRoadIdsRef.current[p.stationId] ?? null;
  };

  // ─── Station adding ────────────────────────────────────────────────────────

  const handleStartAdding = (afterPathIndex: number) => {
    setInsertAfterPathIndex(afterPathIndex);
    setIsAddingStations(true);
    setPendingStations([]);
    setAddingRseAfterPathIndex(null);
    if (currentEditingLineId) {
      postMessageToPlugin({ type: 'start-adding-stations-mode', lineId: currentEditingLineId });
    }
  };

  const handleFinishAdding = () => {
    if (!currentEditingLineId || pendingStations.length === 0) return;
    const newStopInputs: LinePathInput[] = pendingStations.map(s => ({ kind: 'station-stop' as const, stationId: s.id }));
    const fullPathInputs = toLinePathInputs(linePaths);

    const insertAt = insertAfterPathIndex === null ? fullPathInputs.length
      : insertAfterPathIndex === -1 ? 0
      : insertAfterPathIndex + 1;
    const newPaths = [...fullPathInputs.slice(0, insertAt), ...newStopInputs, ...fullPathInputs.slice(insertAt)];

    postMessageToPlugin({ type: 'update-line-path', lineId: currentEditingLineId, paths: newPaths });
    postMessageToPlugin({ type: 'stop-adding-stations-mode' });
    postMessageToPlugin({ type: 'get-line-path', lineId: currentEditingLineId });
    setIsAddingStations(false);
    setPendingStations([]);
    setInsertAfterPathIndex(null);
  };

  const handleCancelAdding = () => {
    setIsAddingStations(false);
    setPendingStations([]);
    setInsertAfterPathIndex(null);
    postMessageToPlugin({ type: 'stop-adding-stations-mode' });
  };

  // ─── RSE adding ────────────────────────────────────────────────────────────

  const startRseMode = (afterPathIndex: number) => {
    setAddingRseAfterPathIndex(afterPathIndex);
    setRseError(null);
    setRseNodeOptions(null);
    setRsePendingRoadId(null);
    setRseSelectedNodeId('');
    setIsAddingStations(false);
    postMessageToPlugin({ type: 'start-adding-rse-mode' });
  };

  const stopRseMode = () => {
    setAddingRseAfterPathIndex(null);
    setRseError(null);
    setRseNodeOptions(null);
    setRsePendingRoadId(null);
    setRseSelectedNodeId('');
    postMessageToPlugin({ type: 'stop-adding-rse-mode' });
  };

  const commitRse = (afterPathIndex: number, sourceRoadId: RoadId, nodeId: NodeId, destRoadId: RoadId) => {
    if (!currentEditingLineId) return;
    const fullPaths = toLinePathInputs(linePathsRef.current);
    const rse: LinePathInput = { kind: 'road-section-enter', sourceRoadId, nodeId, destRoadId };
    const insertAt = afterPathIndex + 1;
    const newPaths = [...fullPaths.slice(0, insertAt), rse, ...fullPaths.slice(insertAt)];
    postMessageToPlugin({ type: 'update-line-path', lineId: currentEditingLineId, paths: newPaths });
    postMessageToPlugin({ type: 'get-line-path', lineId: currentEditingLineId });
    stopRseMode();
  };

  const handleRoadClicked = (afterPathIndex: number, destRoadId: RoadId) => {
    const sourceRoadId = getSourceRoadAt(afterPathIndex);
    if (!sourceRoadId) {
      setRseError('No road context at this position.');
      return;
    }
    if (sourceRoadId === destRoadId) {
      setRseError('That is the same road the line is already on.');
      return;
    }

    const currentRoads = roadsRef.current;
    const currentNodes = nodesRef.current;
    const sourceRoad = currentRoads.find(r => r.id === sourceRoadId);
    const destRoad   = currentRoads.find(r => r.id === destRoadId);
    if (!sourceRoad || !destRoad) return;

    const sourceNodeIds = new Set([sourceRoad.startNodeId, sourceRoad.endNodeId]);
    const sharedNodes = ([destRoad.startNodeId, destRoad.endNodeId] as NodeId[])
      .filter(n => sourceNodeIds.has(n))
      .map(nodeId => {
        const node = currentNodes.find(n => n.id === nodeId);
        return { nodeId, nodeName: node?.name ?? nodeId };
      });

    if (sharedNodes.length === 0) {
      setRseError('Roads are not directly connected by a shared junction.');
      return;
    }

    setRseError(null);

    if (sharedNodes.length === 1) {
      commitRse(afterPathIndex, sourceRoadId, sharedNodes[0].nodeId, destRoadId);
      return;
    }

    // Multiple shared nodes — let the user pick
    setRseNodeOptions(sharedNodes);
    setRsePendingRoadId(destRoadId);
    setRseSelectedNodeId('');
  };

  // ─── Remove / rotate ───────────────────────────────────────────────────────

  const handleRemovePath = (pathIndex: number) => {
    if (!currentEditingLineId) return;
    postMessageToPlugin({ type: 'remove-station-from-line', lineId: currentEditingLineId, pathIndex });
  };

  const handleRemoveRse = (pathIndex: number) => {
    if (!currentEditingLineId) return;
    const newPaths = toLinePathInputs(linePaths.filter((_, i) => i !== pathIndex));
    postMessageToPlugin({ type: 'update-line-path', lineId: currentEditingLineId, paths: newPaths });
    postMessageToPlugin({ type: 'get-line-path', lineId: currentEditingLineId });
  };

  const handleRotatePath = (steps: number) => {
    if (!currentEditingLineId) return;
    postMessageToPlugin({ type: 'rotate-line-path', lineId: currentEditingLineId, steps });
    postMessageToPlugin({ type: 'get-line-path', lineId: currentEditingLineId });
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  const currentLine = lines.find(l => l.id === currentEditingLineId);
  const inactive = !isAddingStations && addingRseAfterPathIndex === null;

  const renderPathItems = () => {
    const elements: React.ReactNode[] = [];

    const hasStopAfter = (i: number) => linePaths.slice(i + 1).some(p => p.kind === 'station-stop');

    const maybeInsertionButtons = (afterPathIndex: number) => {
      if (!inactive) return;
      const isBeforeAll = afterPathIndex === -1;
      const nextPath = isBeforeAll ? linePaths[0] : linePaths[afterPathIndex + 1];
      const showStation = isBeforeAll || !nextPath || nextPath.kind === 'station-stop';
      const showRse = !isBeforeAll && hasStopAfter(afterPathIndex);
      elements.push(
        <InsertionButtons
          key={`insert-${afterPathIndex}`}
          onAddStation={showStation ? () => handleStartAdding(afterPathIndex) : undefined}
          onAddRse={showRse ? () => startRseMode(afterPathIndex) : undefined}
        />
      );
    };

    maybeInsertionButtons(-1);

    for (let i = 0; i < linePaths.length; i++) {
      const path = linePaths[i];

      if (path.kind === 'station-stop') {
        elements.push(
          <StationPathItem
            key={`stop-${i}`}
            name={stationNames[path.stationId] ?? path.stationId}
            index={i}
            onRemove={() => handleRemovePath(path.index)}
            onSelect={() => postMessageToPlugin({ type: 'select-station', stationId: path.stationId })}
          />
        );
      } else {
        const destRoad = roads.find(r => r.id === path.destRoadId);
        elements.push(
          <div key={`rse-${i}`} className="station-path-item" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="station-number" style={{ paddingLeft: '4px', paddingRight: '4px' }}>{i + 1}</span>
            <span style={{ flex: 1, fontStyle: 'italic', color: '#666' }}>↪ {destRoad?.name ?? path.destRoadId}</span>
            {inactive && (
              <button className="button button--secondary small-btn" onClick={() => handleRemoveRse(i)}>X</button>
            )}
          </div>
        );
      }

      maybeInsertionButtons(i);
    }

    return elements;
  };

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
          <div>{renderPathItems()}</div>
        )}

        {isAddingStations && (
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
        )}

        {addingRseAfterPathIndex !== null && (
          <div style={{ padding: '12px', background: '#f5f5f5', borderRadius: '4px', border: '2px solid #18a0fb', marginTop: '8px' }}>
            <p style={{ fontSize: '11px', color: '#666', margin: '0 0 8px 0' }}>
              <strong>Adding road enter</strong><br />
              Click a road section on the canvas to enter from that road.
            </p>
            {rseError && (
              <p style={{ fontSize: '11px', color: '#c00', margin: '0 0 8px 0' }}>{rseError}</p>
            )}
            {rseNodeOptions && rsePendingRoadId && (
              <div style={{ marginBottom: '8px' }}>
                <p style={{ fontSize: '11px', color: '#333', margin: '0 0 4px 0' }}>Multiple junctions — pick one:</p>
                <select
                  className="input"
                  value={rseSelectedNodeId}
                  onChange={e => setRseSelectedNodeId(e.target.value as NodeId)}
                  style={{ fontSize: '11px', width: '100%', marginBottom: '6px' }}
                >
                  <option value="">-- select junction --</option>
                  {rseNodeOptions.map(opt => (
                    <option key={opt.nodeId} value={opt.nodeId}>{opt.nodeName}</option>
                  ))}
                </select>
                <button
                  className="button button--primary"
                  disabled={!rseSelectedNodeId}
                  style={{ width: '100%', marginBottom: '4px' }}
                  onClick={() => {
                    const sourceRoadId = getSourceRoadAt(addingRseAfterPathIndex);
                    if (sourceRoadId && rseSelectedNodeId && rsePendingRoadId) {
                      commitRse(addingRseAfterPathIndex, sourceRoadId, rseSelectedNodeId as NodeId, rsePendingRoadId);
                    }
                  }}
                >
                  Add Road Enter
                </button>
              </div>
            )}
            <button className="button button--secondary" style={{ width: '100%' }} onClick={stopRseMode}>Cancel</button>
          </div>
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
