import React, { useEffect, useRef, useState } from 'react';
import { NodeId, RoadId, RoadSectionId, StationId } from '@/common/types';
import { DisplayEntry, LinePathData } from '@/common/messages';
import { postMessageToPlugin } from '../../figma';
import { useLinesContext } from '../../contexts/LinesContext';
import { useNetworkContext } from '../../contexts/NetworkContext';
import { useMessageManager } from '../../contexts/MessageContext';
import { AddingStationsUISession } from '../../sessions/adding-stations';
import { AddingRseUISession } from '../../sessions/adding-rse';
import { useUISession } from '../../sessions/useUISession';
import PathItemsList from './PathItemsList';
import InsertionButtons from './InsertionButtons';
import StationAddingPanel from './StationAddingPanel';
import RseAddingPanel from './RseAddingPanel';

const PathEditor: React.FC = () => {
  const { currentEditingLineId } = useLinesContext();
  const { roads } = useNetworkContext();
  const manager = useMessageManager();

  const [linePaths, setLinePaths]           = useState<LinePathData[]>([]);
  const [, setStationNames]     = useState<Record<string, string>>({});
  const [stationRoadIds, setStationRoadIds] = useState<Record<string, RoadId | null>>({});
  const [stationSectionIds, setStationSectionIds] = useState<Record<string, RoadSectionId | null>>({});
  const [displayEntries, setDisplayEntries] = useState<DisplayEntry[]>([]);
  const [stationInsertAfterIndex, setStationInsertAfterIndex] = useState<number | null>(null);
  const [addingRseAfterPathIndex, setAddingRseAfterPathIndex] = useState<number | null>(null);

  const currentLineIdRef     = useRef(currentEditingLineId);
  const linePathsRef         = useRef<LinePathData[]>(linePaths);
  const stationRoadIdsRef    = useRef(stationRoadIds);
  const stationSectionIdsRef = useRef(stationSectionIds);
  const stationsSession      = useUISession<AddingStationsUISession>();
  const rseSession           = useUISession<AddingRseUISession>();

  useEffect(() => { currentLineIdRef.current     = currentEditingLineId; }, [currentEditingLineId]);
  useEffect(() => { linePathsRef.current          = linePaths; },           [linePaths]);
  useEffect(() => { stationRoadIdsRef.current     = stationRoadIds; },      [stationRoadIds]);
  useEffect(() => { stationSectionIdsRef.current  = stationSectionIds; },   [stationSectionIds]);

  useEffect(() => {
    const unsub1 = manager.onMessage('line-path-data', msg => {
      setLinePaths(msg.paths);
      setStationNames(msg.stationNames);
      setStationRoadIds(msg.stationRoadIds);
      setStationSectionIds(msg.stationSectionIds);
      setDisplayEntries(msg.displayEntries);
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

  const getSourceAt = (pathIndex: number): { roadId: RoadId | null; sectionId: RoadSectionId | null } => {
    if (pathIndex < 0) return { roadId: null, sectionId: null };
    const p = linePaths[pathIndex];
    if (!p) return { roadId: null, sectionId: null };
    if (p.kind === 'road-section-change') {
      const sectionId = p.entering ? p.entering.sectionId : null;
      const roadId = sectionId ? (roads.find(r => r.id === sectionId[0])?.id ?? null) : null;
      return { roadId, sectionId };
    }
    return { roadId: stationRoadIds[p.stationId] ?? null, sectionId: stationSectionIds[p.stationId] ?? null };
  };

  // ─── Station adding (empty-path only) ─────────────────────────────────────

  const handleStartAdding = (afterPathIndex: number) => {
    if (!currentEditingLineId) return;
    setStationInsertAfterIndex(afterPathIndex);
    setAddingRseAfterPathIndex(null);
    stationsSession.open(new AddingStationsUISession()).start(currentEditingLineId, manager);
  };

  const handleFinishAdding = (stations: Array<{ id: StationId; name: string }>) => {
    if (!currentEditingLineId || stations.length === 0) return;
    const newStops: LinePathData[] = stations.map(s => ({ kind: 'station-stop' as const, stationId: s.id, direction: 'ascending' as const }));
    const insertAt = stationInsertAfterIndex === null ? linePaths.length
      : stationInsertAfterIndex === -1 ? 0
      : stationInsertAfterIndex + 1;
    const newPaths = [...linePaths.slice(0, insertAt), ...newStops, ...linePaths.slice(insertAt)];
    postMessageToPlugin({ type: 'patch-line', lineId: currentEditingLineId, patch: { op: 'update-path', paths: newPaths } });
    stationsSession.close(s => s.stop());
    postMessageToPlugin({ type: 'get-line-path', lineId: currentEditingLineId });
    setStationInsertAfterIndex(null);
  };

  const handleCancelAdding = () => {
    stationsSession.close(s => s.stop());
    setStationInsertAfterIndex(null);
  };

  // ─── Section station adding (inline, no canvas session) ───────────────────

  const handleAddSectionStation = (stationId: StationId, afterPathIndex: number) => {
    if (!currentEditingLineId) return;
    const newStop: LinePathData = { kind: 'station-stop', stationId, direction: 'ascending' };
    const insertAt = afterPathIndex + 1;
    const paths = linePathsRef.current;
    const newPaths = [...paths.slice(0, insertAt), newStop, ...paths.slice(insertAt)];
    postMessageToPlugin({ type: 'patch-line', lineId: currentEditingLineId, patch: { op: 'update-path', paths: newPaths } });
    postMessageToPlugin({ type: 'get-line-path', lineId: currentEditingLineId });
  };

  // ─── RSE adding ────────────────────────────────────────────────────────────

  const startRseMode = (afterPathIndex: number) => {
    setAddingRseAfterPathIndex(afterPathIndex);
    setStationInsertAfterIndex(null);
    rseSession.open(new AddingRseUISession()).start(manager);
  };

  const stopRseMode = () => {
    rseSession.close(s => s.stop());
    setAddingRseAfterPathIndex(null);
  };

  const commitRse = (afterPathIndex: number, exitingSectionId: RoadSectionId | null, nodeId: NodeId, enteringSectionId: RoadSectionId | null) => {
    if (!currentEditingLineId) return;
    const rsc: LinePathData = { kind: 'road-section-change', nodeId, exiting: exitingSectionId ? { sectionId: exitingSectionId, side: 0 } : null, entering: enteringSectionId ? { sectionId: enteringSectionId, side: 0 } : null };
    const paths = linePathsRef.current;
    const newPaths = [...paths.slice(0, afterPathIndex + 1), rsc, ...paths.slice(afterPathIndex + 1)];
    postMessageToPlugin({ type: 'patch-line', lineId: currentEditingLineId, patch: { op: 'update-path', paths: newPaths } });
    postMessageToPlugin({ type: 'get-line-path', lineId: currentEditingLineId });
    stopRseMode();
  };

  // ─── Remove / rotate ───────────────────────────────────────────────────────

  const handleRemovePath = (pathIndex: number) => {
    if (!currentEditingLineId) return;
    postMessageToPlugin({ type: 'patch-line', lineId: currentEditingLineId, patch: { op: 'remove-station', pathIndex } });
  };

  const handleToggleStops = (pathIndex: number, stops: boolean) => {
    if (!currentEditingLineId) return;
    postMessageToPlugin({ type: 'patch-line', lineId: currentEditingLineId, patch: { op: 'toggle-stops', pathIndex, stops } });
    postMessageToPlugin({ type: 'get-line-path', lineId: currentEditingLineId });
  };

  const handleRemoveRse = (pathIndex: number) => {
    if (!currentEditingLineId) return;
    const newPaths = linePaths.filter((_, i) => i !== pathIndex);
    postMessageToPlugin({ type: 'patch-line', lineId: currentEditingLineId, patch: { op: 'update-path', paths: newPaths } });
    postMessageToPlugin({ type: 'get-line-path', lineId: currentEditingLineId });
  };

  const handleRotatePath = (steps: number) => {
    if (!currentEditingLineId) return;
    postMessageToPlugin({ type: 'patch-line', lineId: currentEditingLineId, patch: { op: 'rotate-path', steps } });
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
        <div>
          {inactive && <InsertionButtons onAddStation={() => handleStartAdding(-1)} />}
          <PathItemsList
            displayEntries={displayEntries}
            inactive={inactive}
            onRemoveStop={handleRemovePath}
            onRemoveRse={handleRemoveRse}
            onSelectStation={(stationId) => postMessageToPlugin({ type: 'select-station', stationId })}
            onToggleStops={handleToggleStops}
            onAddSectionStation={handleAddSectionStation}
            onStartAddingRse={startRseMode}
          />
          {inactive && <InsertionButtons onAddStation={() => handleStartAdding(linePaths.length - 1)} />}
        </div>
      )}

      {stationInsertAfterIndex !== null && (
        <StationAddingPanel
          currentRoadId={getSourceAt(stationInsertAfterIndex).roadId}
          stationRoadIds={stationRoadIds}
          onFinish={handleFinishAdding}
          onCancel={handleCancelAdding}
        />
      )}

      {addingRseAfterPathIndex !== null && (() => {
        const src = getSourceAt(addingRseAfterPathIndex);
        return (
          <RseAddingPanel
            afterPathIndex={addingRseAfterPathIndex}
            sourceRoadId={src.roadId}
            exitingSectionId={src.sectionId}
            onCommitRse={commitRse}
            onCancel={stopRseMode}
          />
        );
      })()}

      {inactive && linePaths.filter(p => p.kind === 'station-stop').length > 1 && (
        <div style={{ marginTop: '4px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button className="button button--secondary" onClick={() => handleRotatePath(1)} title="Rotate path by 1">↻</button>
        </div>
      )}
    </div>
  );
};

export default PathEditor;
