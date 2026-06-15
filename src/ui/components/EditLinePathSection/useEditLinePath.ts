import { useEffect, useRef, useState } from 'react';
import { NodeId, RoadId, StationId } from '@/common/types';
import { LinePathInput } from '@/common/messages';
import { LinePath } from '@/plugin/models/structures';
import { postMessageToPlugin } from '../../figma';
import { useLinesContext } from '../../contexts/LinesContext';
import { useNetworkContext } from '../../contexts/NetworkContext';
import { useMessageManager } from '../../contexts/MessageContext';

export function useEditLinePath() {
  const { currentEditingLineId } = useLinesContext();
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

  const isAddingRef      = useRef(isAddingStations);
  const addingRseRef     = useRef(addingRseAfterPathIndex);
  const currentLineIdRef = useRef(currentEditingLineId);
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
        setPendingStations(prev => [...prev, { id: msg.stationId, name: msg.station.name }]);
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

  const commitRseWithSelectedNode = () => {
    if (addingRseAfterPathIndex === null) return;
    const sourceRoadId = getSourceRoadAt(addingRseAfterPathIndex);
    if (sourceRoadId && rseSelectedNodeId && rsePendingRoadId) {
      commitRse(addingRseAfterPathIndex, sourceRoadId, rseSelectedNodeId as NodeId, rsePendingRoadId);
    }
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

  return {
    linePaths,
    stationNames,
    roads,
    isAddingStations,
    pendingStations,
    addingRseAfterPathIndex,
    rseError,
    rseNodeOptions,
    rsePendingRoadId,
    rseSelectedNodeId,
    setRseSelectedNodeId,
    handleStartAdding,
    handleFinishAdding,
    handleCancelAdding,
    startRseMode,
    stopRseMode,
    commitRseWithSelectedNode,
    handleRemovePath,
    handleRemoveRse,
    handleRotatePath,
  };
}
