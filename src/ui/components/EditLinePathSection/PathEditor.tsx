import React, { useEffect, useRef, useState } from 'react';
import { NodeId, RoadId, RoadSectionId, StationId } from '@/common/types';
import { DisplayEntry, LinePathData } from '@/common/messages';
import {
  LinePathAddress, START_ADDRESS, isStartAddress, flattenLinePathData,
  lastAddress as lastGroupAddress, insertedAddress, insertStationStopAfter, insertGroupsAfter, removeRsc,
} from '../../utils/linePathGroups';
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

const RoadInsertButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '2px 0' }}>
    <div style={{ flex: 1, height: '1px', background: '#d0d0d0' }} />
    <button className="button button--secondary" style={{ fontSize: '10px', padding: '2px 6px', lineHeight: '14px' }} onClick={onClick}>
      ↪ Road
    </button>
    <div style={{ flex: 1, height: '1px', background: '#d0d0d0' }} />
  </div>
);

const PathEditor: React.FC = () => {
  const { currentEditingLineId } = useLinesContext();
  const { roads } = useNetworkContext();
  const manager = useMessageManager();

  const [linePaths, setLinePaths]           = useState<LinePathData[]>([]);
  const [, setStationNames]     = useState<Record<string, string>>({});
  const [stationRoadIds, setStationRoadIds] = useState<Record<string, RoadId | null>>({});
  const [stationSectionIds, setStationSectionIds] = useState<Record<string, RoadSectionId | null>>({});
  const [displayEntries, setDisplayEntries] = useState<DisplayEntry[]>([]);
  const [stationInsertAfterIndex, setStationInsertAfterIndex] = useState<LinePathAddress | null>(null);
  const [addingRseAfterPathIndex, setAddingRseAfterPathIndex] = useState<LinePathAddress | null>(null);

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

  const getSourceAt = (address: LinePathAddress): { roadId: RoadId | null; sectionId: RoadSectionId | null } => {
    if (isStartAddress(address)) return { roadId: null, sectionId: null };
    const group = linePaths[address.groupIndex];
    if (!group) return { roadId: null, sectionId: null };
    if (address.stopIndex === -1) {
      const sectionId = group.entering ? group.entering.sectionId : null;
      const roadId = sectionId ? (roads.find(r => r.id === sectionId[0])?.id ?? null) : null;
      return { roadId, sectionId };
    }
    const stop = group.stationStops[address.stopIndex];
    if (!stop) return { roadId: null, sectionId: null };
    return { roadId: stationRoadIds[stop.stationId] ?? null, sectionId: stationSectionIds[stop.stationId] ?? null };
  };

  // ─── Station adding (empty-path only) ─────────────────────────────────────

  const handleStartAdding = (after: LinePathAddress) => {
    if (!currentEditingLineId) return;
    setStationInsertAfterIndex(after);
    setAddingRseAfterPathIndex(null);
    stationsSession.open(new AddingStationsUISession()).start(currentEditingLineId, manager);
  };

  const handleFinishAdding = (stations: Array<{ id: StationId; name: string }>) => {
    if (!currentEditingLineId || stations.length === 0 || stationInsertAfterIndex === null) return;
    let newPaths = linePaths;
    let cursor = stationInsertAfterIndex;
    for (const s of stations) {
      newPaths = insertStationStopAfter(newPaths, cursor, { stationId: s.id, direction: 'ascending' });
      cursor = insertedAddress(cursor);
    }
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

  const handleAddSectionStation = (stationId: StationId, after: LinePathAddress, direction: 'ascending' | 'descending') => {
    if (!currentEditingLineId) return;
    const newPaths = insertStationStopAfter(linePathsRef.current, after, { stationId, direction });
    postMessageToPlugin({ type: 'patch-line', lineId: currentEditingLineId, patch: { op: 'update-path', paths: newPaths } });
    postMessageToPlugin({ type: 'get-line-path', lineId: currentEditingLineId });
  };

  // ─── RSE adding ────────────────────────────────────────────────────────────

  const startRseMode = (after: LinePathAddress) => {
    setAddingRseAfterPathIndex(after);
    setStationInsertAfterIndex(null);
    rseSession.open(new AddingRseUISession()).start(manager);
  };

  const stopRseMode = () => {
    rseSession.close(s => s.stop());
    setAddingRseAfterPathIndex(null);
  };

  const commitRses = (
    after: LinePathAddress,
    entries: Array<{ nodeId: NodeId; exitingSectionId: RoadSectionId | null; enteringSectionId: RoadSectionId | null }>
  ) => {
    if (!currentEditingLineId) return;
    const newGroups: LinePathData[] = entries.map(e => ({
      fromNodeId: e.nodeId,
      exiting: e.exitingSectionId ? { sectionId: e.exitingSectionId, side: 0 as const, rank: 0 } : null,
      entering: e.enteringSectionId ? { sectionId: e.enteringSectionId, side: 0 as const, rank: 0 } : null,
      stationStops: [],
    }));
    const newPaths = insertGroupsAfter(linePathsRef.current, after, newGroups);
    postMessageToPlugin({ type: 'patch-line', lineId: currentEditingLineId, patch: { op: 'update-path', paths: newPaths } });
    postMessageToPlugin({ type: 'get-line-path', lineId: currentEditingLineId });
    stopRseMode();
  };

  // ─── Remove / rotate ───────────────────────────────────────────────────────

  const handleRemovePath = (groupIndex: number, stopIndex: number) => {
    if (!currentEditingLineId) return;
    postMessageToPlugin({ type: 'patch-line', lineId: currentEditingLineId, patch: { op: 'remove-station', groupIndex, stopIndex } });
  };

  const handleToggleStops = (groupIndex: number, stopIndex: number, stops: boolean) => {
    if (!currentEditingLineId) return;
    postMessageToPlugin({ type: 'patch-line', lineId: currentEditingLineId, patch: { op: 'toggle-stops', groupIndex, stopIndex, stops } });
    postMessageToPlugin({ type: 'get-line-path', lineId: currentEditingLineId });
  };

  const handleRemoveRse = (groupIndex: number) => {
    if (!currentEditingLineId) return;
    const newPaths = removeRsc(linePaths, groupIndex);
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
  const isEmpty = flattenLinePathData(linePaths).length === 0;
  const stationStopCount = linePaths.reduce((n, g) => n + g.stationStops.length, 0);

  return (
    <div className="grid">
      <label>Current Path</label>

      {isEmpty ? (
        <div>
          <p style={{ color: '#666', fontSize: '11px', padding: '8px' }}>No stops in path</p>
          {inactive && <InsertionButtons onAddStation={() => handleStartAdding(START_ADDRESS)} />}
        </div>
      ) : (
        <div>
          {inactive && <RoadInsertButton onClick={() => startRseMode(START_ADDRESS)} />}
          <PathItemsList
            displayEntries={displayEntries}
            linePaths={linePaths}
            inactive={inactive}
            onRemoveStop={handleRemovePath}
            onRemoveRse={handleRemoveRse}
            onSelectStation={(stationId) => postMessageToPlugin({ type: 'select-station', stationId })}
            onToggleStops={handleToggleStops}
            onAddSectionStation={handleAddSectionStation}
            onStartAddingRse={startRseMode}
          />
          {inactive && <RoadInsertButton onClick={() => startRseMode(lastGroupAddress(linePaths))} />}
        </div>
      )}

      {stationInsertAfterIndex !== null && (
        <StationAddingPanel
          currentRoadId={getSourceAt(stationInsertAfterIndex).roadId}
          stationRoadIds={stationRoadIds}
          onFinish={handleFinishAdding}
          onCancel={handleCancelAdding}
          onSwitchToRse={() => {
            const afterIdx = stationInsertAfterIndex;
            stationsSession.close(s => s.stop());
            setStationInsertAfterIndex(null);
            startRseMode(afterIdx);
          }}
        />
      )}

      {addingRseAfterPathIndex !== null && (() => {
        const src = getSourceAt(addingRseAfterPathIndex);
        return (
          <RseAddingPanel
            afterPathIndex={addingRseAfterPathIndex}
            sourceRoadId={src.roadId}
            exitingSectionId={src.sectionId}
            onCommitRses={commitRses}
            onCancel={stopRseMode}
          />
        );
      })()}

      {inactive && stationStopCount > 1 && (
        <div style={{ marginTop: '4px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button className="button button--secondary" onClick={() => handleRotatePath(1)} title="Rotate path by 1">↻</button>
        </div>
      )}
    </div>
  );
};

export default PathEditor;
