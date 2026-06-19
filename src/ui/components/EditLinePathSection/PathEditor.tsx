import React, { useEffect, useRef, useState } from 'react';
import { NodeId, RoadId, StationId } from '@/common/types';
import { LinePathInput } from '@/common/messages';
import { LinePath } from '@/plugin/models/structures';
import { postMessageToPlugin } from '../../figma';
import { useLinesContext } from '../../contexts/LinesContext';
import { useNetworkContext } from '../../contexts/NetworkContext';
import { useMessageManager } from '../../contexts/MessageContext';
import PathItemsList from './PathItemsList';
import InsertionButtons from './InsertionButtons';
import StationAddingPanel from './StationAddingPanel';
import RseAddingPanel from './RseAddingPanel';

const PathEditor: React.FC = () => {
  const { currentEditingLineId } = useLinesContext();
  const { roads } = useNetworkContext();
  const manager = useMessageManager();

  const [linePaths, setLinePaths]           = useState<LinePath[]>([]);
  const [stationNames, setStationNames]     = useState<Record<string, string>>({});
  const [stationRoadIds, setStationRoadIds] = useState<Record<string, RoadId | null>>({});
  const [stationInsertAfterIndex, setStationInsertAfterIndex] = useState<number | null>(null);
  const [addingRseAfterPathIndex, setAddingRseAfterPathIndex] = useState<number | null>(null);

  const currentLineIdRef  = useRef(currentEditingLineId);
  const linePathsRef      = useRef(linePaths);
  const stationRoadIdsRef = useRef(stationRoadIds);
  useEffect(() => { currentLineIdRef.current  = currentEditingLineId; }, [currentEditingLineId]);
  useEffect(() => { linePathsRef.current      = linePaths; },           [linePaths]);
  useEffect(() => { stationRoadIdsRef.current = stationRoadIds; },      [stationRoadIds]);

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
    return () => { unsub1(); unsub2(); };
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

  const getSourceRoadAt = (pathIndex: number): RoadId | null => {
    if (pathIndex < 0) return null;
    const p = linePathsRef.current[pathIndex];
    if (!p) return null;
    if (p.kind === 'road-section-enter') return p.destRoadId;
    return stationRoadIdsRef.current[p.stationId] ?? null;
  };

  // ─── Station adding ────────────────────────────────────────────────────────

  const handleStartAdding = (afterPathIndex: number) => {
    setStationInsertAfterIndex(afterPathIndex);
    setAddingRseAfterPathIndex(null);
    if (currentEditingLineId) {
      postMessageToPlugin({ type: 'start-adding-stations-mode', lineId: currentEditingLineId });
    }
  };

  const handleFinishAdding = (stations: Array<{ id: StationId; name: string }>) => {
    if (!currentEditingLineId || stations.length === 0) return;
    const newStopInputs: LinePathInput[] = stations.map(s => ({ kind: 'station-stop' as const, stationId: s.id }));
    const fullPathInputs = toLinePathInputs(linePaths);
    const insertAt = stationInsertAfterIndex === null ? fullPathInputs.length
      : stationInsertAfterIndex === -1 ? 0
      : stationInsertAfterIndex + 1;
    const newPaths = [...fullPathInputs.slice(0, insertAt), ...newStopInputs, ...fullPathInputs.slice(insertAt)];
    postMessageToPlugin({ type: 'update-line-path', lineId: currentEditingLineId, paths: newPaths });
    postMessageToPlugin({ type: 'stop-adding-stations-mode' });
    postMessageToPlugin({ type: 'get-line-path', lineId: currentEditingLineId });
    setStationInsertAfterIndex(null);
  };

  const handleCancelAdding = () => {
    setStationInsertAfterIndex(null);
    postMessageToPlugin({ type: 'stop-adding-stations-mode' });
  };

  // ─── RSE adding ────────────────────────────────────────────────────────────

  const startRseMode = (afterPathIndex: number) => {
    setAddingRseAfterPathIndex(afterPathIndex);
    setStationInsertAfterIndex(null);
    postMessageToPlugin({ type: 'start-adding-rse-mode' });
  };

  const stopRseMode = () => {
    setAddingRseAfterPathIndex(null);
    postMessageToPlugin({ type: 'stop-adding-rse-mode' });
  };

  const commitRse = (afterPathIndex: number, sourceRoadId: RoadId, nodeId: NodeId, destRoadId: RoadId) => {
    if (!currentEditingLineId) return;
    const fullPaths = toLinePathInputs(linePathsRef.current);
    const rse: LinePathInput = { kind: 'road-section-enter', sourceRoadId, nodeId, destRoadId };
    const newPaths = [...fullPaths.slice(0, afterPathIndex + 1), rse, ...fullPaths.slice(afterPathIndex + 1)];
    postMessageToPlugin({ type: 'update-line-path', lineId: currentEditingLineId, paths: newPaths });
    postMessageToPlugin({ type: 'get-line-path', lineId: currentEditingLineId });
    stopRseMode();
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

  const inactive = stationInsertAfterIndex === null && addingRseAfterPathIndex === null;

  return (
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

      {stationInsertAfterIndex !== null && (
        <StationAddingPanel
          onFinish={handleFinishAdding}
          onCancel={handleCancelAdding}
        />
      )}

      {addingRseAfterPathIndex !== null && (
        <RseAddingPanel
          afterPathIndex={addingRseAfterPathIndex}
          sourceRoadId={getSourceRoadAt(addingRseAfterPathIndex)}
          onCommitRse={commitRse}
          onCancel={stopRseMode}
        />
      )}

      {inactive && linePaths.filter(p => p.kind === 'station-stop').length > 1 && (
        <div style={{ marginTop: '4px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button className="button button--secondary" onClick={() => handleRotatePath(1)} title="Rotate path by 1">↻</button>
        </div>
      )}
    </div>
  );
};

export default PathEditor;
