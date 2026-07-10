import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { NodeId, RoadId, RoadSectionId, StationId } from '@/common/types';
import { DisplayEntry, RoadSectionPassData } from '@/common/messages';
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
  const { lines, currentEditingLineId } = useLinesContext();
  const currentLineColor = lines.find(l => l.id === currentEditingLineId)?.color;
  const { roads } = useNetworkContext();
  const manager = useMessageManager();

  const [linePaths, setLinePaths]           = useState<RoadSectionPassData[]>([]);
  const [displayEntries, setDisplayEntries] = useState<DisplayEntry[]>([]);
  const [addingRseAtBoundary, setAddingRseAtBoundary] = useState<number | null>(null);
  const [rseNodeConstraints, setRseNodeConstraints] = useState<{ knownStartNodeId: NodeId | null; requiredEndNodeId: NodeId | null }>({ knownStartNodeId: null, requiredEndNodeId: null });

  const currentLineIdRef     = useRef(currentEditingLineId);
  const linePathsRef         = useRef<RoadSectionPassData[]>(linePaths);
  const pendingToggleRef     = useRef(false);
  const rseSession           = useUISession<AddingRseUISession>();

  useEffect(() => { currentLineIdRef.current     = currentEditingLineId; }, [currentEditingLineId]);
  useEffect(() => { linePathsRef.current          = linePaths; },           [linePaths]);

  useEffect(() => {
    const unsub1 = manager.onMessage('line-path-data', msg => {
      setLinePaths(msg.paths);
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

  // The road/section a newly inserted chain continues from — the pass ending right
  // before this boundary, if any (null at the very start of the path).
  const getSourceAt = (boundaryIndex: number): { roadId: RoadId | null; sectionId: RoadSectionId | null } => {
    const fromPass = boundaryIndex > 0 ? linePaths[boundaryIndex - 1] : null;
    if (!fromPass) return { roadId: null, sectionId: null };
    return { roadId: fromPass.sectionId[0], sectionId: fromPass.sectionId };
  };

  // ─── RSE adding ────────────────────────────────────────────────────────────

  const startRseMode = (boundaryIndex: number, knownStartNodeId: NodeId | null = null, requiredEndNodeId: NodeId | null = null) => {
    setAddingRseAtBoundary(boundaryIndex);
    setRseNodeConstraints({ knownStartNodeId, requiredEndNodeId });
    rseSession.open(new AddingRseUISession()).start(manager);
  };

  const stopRseMode = () => {
    rseSession.close(s => s.stop());
    setAddingRseAtBoundary(null);
    setRseNodeConstraints({ knownStartNodeId: null, requiredEndNodeId: null });
  };

  const commitRses = (
    boundaryIndex: number,
    entries: Array<{ nodeId: NodeId; exitingSectionId: RoadSectionId | null; enteringSectionId: RoadSectionId | null }>
  ) => {
    if (!currentEditingLineId) return;
    // A pass's direction is 'ascending' iff it's entered from the road's start node —
    // must match the node the chain actually crosses at, not always default to
    // ascending, or the pass would face the wrong way.
    const directionAt = (sectionId: RoadSectionId, nodeId: NodeId): 'ascending' | 'descending' => {
      const road = roads.find(r => r.id === sectionId[0]);
      return road?.startNodeId === nodeId ? 'ascending' : 'descending';
    };
    const newPasses: RoadSectionPassData[] = entries.flatMap(e => {
      if (!e.enteringSectionId) return [];
      return [{
        sectionId: e.enteringSectionId,
        direction: directionAt(e.enteringSectionId, e.nodeId),
        fromRank: 0,
        toRank: 0,
        stops: [],
      }];
    });
    flushPendingToggles();
    postMessageToPlugin({ type: 'patch-line', lineId: currentEditingLineId, patch: { op: 'insert-passes', boundaryIndex, passes: newPasses } });
    postMessageToPlugin({ type: 'get-line-path', lineId: currentEditingLineId });
    stopRseMode();
  };

  // ─── Remove / rotate ───────────────────────────────────────────────────────

  const handleRemoveStop = (passIndex: number, stationId: StationId) => {
    if (!currentEditingLineId) return;
    flushPendingToggles();
    postMessageToPlugin({ type: 'patch-line', lineId: currentEditingLineId, patch: { op: 'remove-station', passIndex, stationId } });
  };

  // Only updates local state — deferred to a single update-path patch (see
  // flushPendingToggles) so toggling a checkbox doesn't trigger a canvas
  // re-render on every click.
  const handleToggleStops = (passIndex: number, stationId: StationId, stops: boolean) => {
    if (!currentEditingLineId) return;
    const nextPaths = linePaths.map((p, pi) => pi !== passIndex ? p : {
      ...p,
      stops: p.stops.map(s => s.stationId !== stationId ? s : { ...s, stops }),
    });
    linePathsRef.current = nextPaths;
    setLinePaths(nextPaths);
    pendingToggleRef.current = true;
    setDisplayEntries(prev => prev.map(entry => entry.kind !== 'traversal' ? entry : {
      ...entry,
      stations: entry.stations.map(s => s.stationId === stationId && s.passIndex === passIndex ? { ...s, stops } : s),
    }));
  };

  const handleRemovePass = (passIndex: number) => {
    if (!currentEditingLineId) return;
    flushPendingToggles();
    postMessageToPlugin({ type: 'patch-line', lineId: currentEditingLineId, patch: { op: 'remove-pass', passIndex } });
    postMessageToPlugin({ type: 'get-line-path', lineId: currentEditingLineId });
  };

  const handleRotatePath = (steps: number) => {
    if (!currentEditingLineId) return;
    flushPendingToggles();
    postMessageToPlugin({ type: 'patch-line', lineId: currentEditingLineId, patch: { op: 'rotate-path', steps } });
    postMessageToPlugin({ type: 'get-line-path', lineId: currentEditingLineId });
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  const inactive = addingRseAtBoundary === null;
  const isEmpty = linePaths.length === 0;
  const realStopCount = linePaths.reduce((n, p) => n + p.stops.filter(s => s.stops).length, 0);

  return (
    <div className="flex flex-col gap-2">
      <label className="mb-1 block font-medium select-none">Current Path</label>

      {isEmpty ? (
        <div>
          <p className="p-2 text-[11px] text-neutral-500">No stops in path</p>
          {inactive && <RoadInsertButton onClick={() => startRseMode(0)} />}
        </div>
      ) : (
        <PathItemsList
          displayEntries={displayEntries}
          inactive={inactive}
          lineColor={currentLineColor}
          onRemoveStop={handleRemoveStop}
          onRemovePass={handleRemovePass}
          onSelectStation={(stationId) => postMessageToPlugin({ type: 'select-station', stationId })}
          onToggleStops={handleToggleStops}
          onInsertRoad={startRseMode}
        />
      )}

      {addingRseAtBoundary !== null && (() => {
        const src = getSourceAt(addingRseAtBoundary);
        return (
          <RseAddingPanel
            afterPathIndex={addingRseAtBoundary}
            sourceRoadId={src.roadId}
            exitingSectionId={src.sectionId}
            knownStartNodeId={rseNodeConstraints.knownStartNodeId}
            requiredEndNodeId={rseNodeConstraints.requiredEndNodeId}
            onCommitRses={commitRses}
            onCancel={stopRseMode}
          />
        );
      })()}

      {inactive && realStopCount > 1 && (
        <div className="mt-1 flex justify-end gap-2">
          <Button onClick={() => handleRotatePath(1)} title="Rotate path by 1">↻</Button>
        </div>
      )}
    </div>
  );
});

PathEditor.displayName = 'PathEditor';

export default PathEditor;
