import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { NodeId, RoadId, RoadSectionId } from '@/common/types';
import { DisplayEntry, LinePathData } from '@/common/messages';
import {
  LinePathAddress, START_ADDRESS, isStartAddress, flattenLinePathData,
  lastAddress as lastGroupAddress, insertGroupsAfter, removeRsc,
} from '../../utils/linePathGroups';
import { postMessageToPlugin } from '../../figma';
import Button from '../common/Button';
import { useLinesContext } from '../../contexts/LinesContext';
import { useNetworkContext } from '../../contexts/NetworkContext';
import { useMessageManager } from '../../contexts/MessageContext';
import { AddingRseUISession } from '../../sessions/adding-rse';
import { useUISession } from '../../sessions/useUISession';
import PathItemsList from './PathItemsList';
import RseAddingPanel from './RseAddingPanel';

const RoadInsertButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <div className="flex items-center gap-1.5 py-0.5">
    <div className="h-px flex-1 bg-neutral-300" />
    <Button size="xxs" onClick={onClick}>
      ↪ Road
    </Button>
    <div className="h-px flex-1 bg-neutral-300" />
  </div>
);

export interface PathEditorHandle {
  flushPendingToggles: () => void;
}

const PathEditor = forwardRef<PathEditorHandle>((_props, ref) => {
  const { currentEditingLineId } = useLinesContext();
  const { roads } = useNetworkContext();
  const manager = useMessageManager();

  const [linePaths, setLinePaths]           = useState<LinePathData[]>([]);
  const [, setStationNames]     = useState<Record<string, string>>({});
  const [stationRoadIds, setStationRoadIds] = useState<Record<string, RoadId | null>>({});
  const [stationSectionIds, setStationSectionIds] = useState<Record<string, RoadSectionId | null>>({});
  const [displayEntries, setDisplayEntries] = useState<DisplayEntry[]>([]);
  const [addingRseAfterPathIndex, setAddingRseAfterPathIndex] = useState<LinePathAddress | null>(null);
  const [rseNodeConstraints, setRseNodeConstraints] = useState<{ knownStartNodeId: NodeId | null; requiredEndNodeId: NodeId | null }>({ knownStartNodeId: null, requiredEndNodeId: null });

  const currentLineIdRef     = useRef(currentEditingLineId);
  const linePathsRef         = useRef<LinePathData[]>(linePaths);
  const pendingToggleRef     = useRef(false);
  const rseSession           = useUISession<AddingRseUISession>();

  useEffect(() => { currentLineIdRef.current     = currentEditingLineId; }, [currentEditingLineId]);
  useEffect(() => { linePathsRef.current          = linePaths; },           [linePaths]);

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
    pendingToggleRef.current = false;
    if (currentEditingLineId) {
      postMessageToPlugin({ type: 'get-line-path', lineId: currentEditingLineId });
    }
  }, [currentEditingLineId]);

  // Stop-flag toggles only update local state (see handleToggleStops) so the
  // canvas isn't re-rendered on every checkbox click. This flushes them to the
  // plugin as a single update-path patch — called before any other patch that
  // would refetch from the backend, and when the user leaves the path editor.
  const flushPendingToggles = () => {
    if (!pendingToggleRef.current) return;
    const lineId = currentLineIdRef.current;
    pendingToggleRef.current = false;
    if (!lineId) return;
    postMessageToPlugin({ type: 'patch-line', lineId, patch: { op: 'update-path', paths: linePathsRef.current } });
  };

  useImperativeHandle(ref, () => ({ flushPendingToggles }));

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

  // ─── RSE adding ────────────────────────────────────────────────────────────

  const startRseMode = (after: LinePathAddress, knownStartNodeId: NodeId | null = null, requiredEndNodeId: NodeId | null = null) => {
    setAddingRseAfterPathIndex(after);
    setRseNodeConstraints({ knownStartNodeId, requiredEndNodeId });
    rseSession.open(new AddingRseUISession()).start(manager);
  };

  const stopRseMode = () => {
    rseSession.close(s => s.stop());
    setAddingRseAfterPathIndex(null);
    setRseNodeConstraints({ knownStartNodeId: null, requiredEndNodeId: null });
  };

  const commitRses = (
    after: LinePathAddress,
    entries: Array<{ nodeId: NodeId; exitingSectionId: RoadSectionId | null; enteringSectionId: RoadSectionId | null }>
  ) => {
    if (!currentEditingLineId) return;
    // A section's side (0/1) records which end of its road the junction node sits at —
    // it must match the node the RSC actually crosses at, not always default to 0,
    // or validateLinePaths mis-infers the line's direction there (see autoInsertRSCTo).
    const sideAt = (sectionId: RoadSectionId | null, nodeId: NodeId): 0 | 1 => {
      const road = sectionId ? roads.find(r => r.id === sectionId[0]) : undefined;
      return road?.endNodeId === nodeId ? 1 : 0;
    };
    const newGroups: LinePathData[] = entries.map(e => ({
      fromNodeId: e.nodeId,
      exiting: e.exitingSectionId ? { sectionId: e.exitingSectionId, side: sideAt(e.exitingSectionId, e.nodeId), rank: 0 } : null,
      entering: e.enteringSectionId ? { sectionId: e.enteringSectionId, side: sideAt(e.enteringSectionId, e.nodeId), rank: 0 } : null,
      stationStops: [],
    }));
    flushPendingToggles();
    const newPaths = insertGroupsAfter(linePathsRef.current, after, newGroups);
    postMessageToPlugin({ type: 'patch-line', lineId: currentEditingLineId, patch: { op: 'update-path', paths: newPaths } });
    postMessageToPlugin({ type: 'get-line-path', lineId: currentEditingLineId });
    stopRseMode();
  };

  // ─── Remove / rotate ───────────────────────────────────────────────────────

  const handleRemovePath = (groupIndex: number, stopIndex: number) => {
    if (!currentEditingLineId) return;
    flushPendingToggles();
    postMessageToPlugin({ type: 'patch-line', lineId: currentEditingLineId, patch: { op: 'remove-station', groupIndex, stopIndex } });
  };

  // Only updates local state — deferred to a single update-path patch (see
  // flushPendingToggles) so toggling a checkbox doesn't trigger a canvas
  // re-render on every click.
  const handleToggleStops = (groupIndex: number, stopIndex: number, stops: boolean) => {
    if (!currentEditingLineId) return;
    const stationId = linePaths[groupIndex]?.stationStops[stopIndex]?.stationId;
    const nextPaths = linePaths.map((g, gi) => gi !== groupIndex ? g : {
      ...g,
      stationStops: g.stationStops.map((s, si) => si !== stopIndex ? s : { ...s, stops }),
    });
    linePathsRef.current = nextPaths;
    setLinePaths(nextPaths);
    pendingToggleRef.current = true;
    if (stationId) {
      setDisplayEntries(prev => prev.map(entry => entry.kind !== 'traversal' ? entry : {
        ...entry,
        stations: entry.stations.map(s => s.stationId === stationId ? { ...s, stops } : s),
      }));
    }
  };

  const handleToggleDirection = (groupIndex: number, stopIndex: number, direction: 'ascending' | 'descending') => {
    if (!currentEditingLineId) return;
    flushPendingToggles();
    postMessageToPlugin({ type: 'patch-line', lineId: currentEditingLineId, patch: { op: 'toggle-direction', groupIndex, stopIndex, direction } });
    postMessageToPlugin({ type: 'get-line-path', lineId: currentEditingLineId });
  };

  const handleRemoveRse = (groupIndex: number) => {
    if (!currentEditingLineId) return;
    flushPendingToggles();
    const newPaths = removeRsc(linePaths, groupIndex);
    postMessageToPlugin({ type: 'patch-line', lineId: currentEditingLineId, patch: { op: 'update-path', paths: newPaths } });
    postMessageToPlugin({ type: 'get-line-path', lineId: currentEditingLineId });
  };

  const handleRotatePath = (steps: number) => {
    if (!currentEditingLineId) return;
    flushPendingToggles();
    postMessageToPlugin({ type: 'patch-line', lineId: currentEditingLineId, patch: { op: 'rotate-path', steps } });
    postMessageToPlugin({ type: 'get-line-path', lineId: currentEditingLineId });
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  const inactive = addingRseAfterPathIndex === null;
  const isEmpty = flattenLinePathData(linePaths).length === 0;
  const stationStopCount = linePaths.reduce((n, g) => n + g.stationStops.length, 0);

  return (
    <div className="flex flex-col gap-2">
      <label className="mb-1 block font-medium select-none">Current Path</label>

      {isEmpty ? (
        <div>
          <p className="p-2 text-[11px] text-neutral-500">No stops in path</p>
          {inactive && <RoadInsertButton onClick={() => startRseMode(START_ADDRESS)} />}
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
            onToggleDirection={handleToggleDirection}
            onInsertRoad={startRseMode}
          />
          {inactive && <RoadInsertButton onClick={() => startRseMode(lastGroupAddress(linePaths))} />}
        </div>
      )}

      {addingRseAfterPathIndex !== null && (() => {
        const src = getSourceAt(addingRseAfterPathIndex);
        return (
          <RseAddingPanel
            afterPathIndex={addingRseAfterPathIndex}
            sourceRoadId={src.roadId}
            exitingSectionId={src.sectionId}
            knownStartNodeId={rseNodeConstraints.knownStartNodeId}
            requiredEndNodeId={rseNodeConstraints.requiredEndNodeId}
            onCommitRses={commitRses}
            onCancel={stopRseMode}
          />
        );
      })()}

      {inactive && stationStopCount > 1 && (
        <div className="mt-1 flex justify-end gap-2">
          <Button onClick={() => handleRotatePath(1)} title="Rotate path by 1">↻</Button>
        </div>
      )}
    </div>
  );
});

PathEditor.displayName = 'PathEditor';

export default PathEditor;
