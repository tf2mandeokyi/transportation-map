import React, { useEffect, useRef, useState } from 'react';
import { NodeId, RoadId, RoadSectionId } from '@/common/types';
import { RoadSectionData } from '@/common/messages';
import { LinePathAddress } from '../../utils/linePathGroups';
import { useMessageManager } from '../../contexts/MessageContext';
import { useNetworkContext } from '../../contexts/NetworkContext';

interface RseAddingPanelProps {
  afterPathIndex: LinePathAddress;
  sourceRoadId: RoadId | null;
  exitingSectionId: RoadSectionId | null;
  onCommitRses: (
    afterPathIndex: LinePathAddress,
    entries: Array<{ nodeId: NodeId; exitingSectionId: RoadSectionId | null; enteringSectionId: RoadSectionId | null }>
  ) => void;
  onCancel: () => void;
}

type PendingRse = {
  destRoadId: RoadId;
  destRoadName: string | undefined;
  isUturn: boolean;
  nodeOptions: Array<{ nodeId: NodeId; nodeName: string }>;
  sections: RoadSectionData[];
  selectedNodeId: string;
  selectedSectionIdx: string;
};

const RseAddingPanel: React.FC<RseAddingPanelProps> = ({
  afterPathIndex, sourceRoadId, exitingSectionId, onCommitRses, onCancel,
}) => {
  const manager = useMessageManager();
  const { roads, nodes } = useNetworkContext();

  const [error, setError] = useState<string | null>(null);
  const [pendingList, setPendingList] = useState<PendingRse[]>([]);

  const pendingListRef = useRef<PendingRse[]>([]);
  useEffect(() => { pendingListRef.current = pendingList; }, [pendingList]);

  const handleRef = useRef<(destRoadId: RoadId, sectionId: RoadSectionId | null) => void>(() => {});
  handleRef.current = (destRoadId: RoadId, sectionId: RoadSectionId | null) => {
    const list = pendingListRef.current;
    const currentRoadId = list.length > 0 ? list[list.length - 1].destRoadId : sourceRoadId;
    const destRoad = roads.find(r => r.id === destRoadId);
    if (!destRoad) return;

    setError(null);

    const sectionIdx = sectionId ? destRoad.sections.findIndex(s => s.id[1] === sectionId[1]) : -1;
    const selectedSectionIdx = sectionIdx >= 0 ? String(sectionIdx) : '';

    if (currentRoadId === destRoadId) {
      // U-turn on same road
      const nodeOptions = ([destRoad.startNodeId, destRoad.endNodeId] as NodeId[]).map(nodeId => ({
        nodeId,
        nodeName: nodes.find(n => n.id === nodeId)?.name ?? nodeId,
      }));
      setPendingList(prev => [...prev, {
        destRoadId,
        destRoadName: destRoad.name,
        isUturn: true,
        nodeOptions,
        sections: destRoad.sections,
        selectedNodeId: nodeOptions.length === 1 ? nodeOptions[0].nodeId : '',
        selectedSectionIdx,
      }]);
      return;
    }

    if (!currentRoadId) {
      setError('No road context at this position.');
      return;
    }

    const sourceRoad = roads.find(r => r.id === currentRoadId);
    if (!sourceRoad) return;

    const sourceNodeIds = new Set([sourceRoad.startNodeId, sourceRoad.endNodeId]);
    const sharedNodes = ([destRoad.startNodeId, destRoad.endNodeId] as NodeId[])
      .filter(n => sourceNodeIds.has(n))
      .map(nodeId => ({ nodeId, nodeName: nodes.find(n => n.id === nodeId)?.name ?? nodeId }));

    if (sharedNodes.length === 0) {
      setError('Roads are not directly connected by a shared junction.');
      return;
    }

    setPendingList(prev => [...prev, {
      destRoadId,
      destRoadName: destRoad.name,
      isUturn: false,
      nodeOptions: sharedNodes,
      sections: destRoad.sections,
      selectedNodeId: sharedNodes.length === 1 ? sharedNodes[0].nodeId : '',
      selectedSectionIdx,
    }]);
  };

  useEffect(() => {
    return manager.onMessage('road-clicked', msg => handleRef.current(msg.roadId, msg.sectionId));
  }, [manager]);

  const updateEntry = (index: number, patch: Partial<Pick<PendingRse, 'selectedNodeId' | 'selectedSectionIdx'>>) => {
    setPendingList(prev => prev.map((e, i) => i === index ? { ...e, ...patch } : e));
  };

  // Removing entry n also removes all entries after it since the road chain is invalidated.
  const removeEntry = (index: number) => {
    setPendingList(prev => prev.slice(0, index));
  };

  const handleCommit = () => {
    const list = pendingListRef.current;
    const entries = list.map((entry, i) => {
      const nodeId = entry.selectedNodeId as NodeId;
      const idx = parseInt(entry.selectedSectionIdx, 10);
      const enteringSectionId = entry.sections[idx]?.id ?? null;
      const prevEntry = list[i - 1];
      const prevIdx = prevEntry ? parseInt(prevEntry.selectedSectionIdx, 10) : -1;
      const exiting = i === 0
        ? exitingSectionId
        : (prevEntry?.sections[prevIdx]?.id ?? null);
      return { nodeId, exitingSectionId: exiting, enteringSectionId };
    });
    onCommitRses(afterPathIndex, entries);
  };

  const canCommit = pendingList.length > 0 &&
    pendingList.every(e => !!e.selectedNodeId && e.selectedSectionIdx !== '');

  return (
    <div className="mt-2 rounded border-2 border-[#18a0fb] bg-neutral-100 p-3">
      <p className="mb-2 text-[11px] text-neutral-500">
        <strong>Adding roads</strong><br />
        Click roads on the canvas. Click the same road to add a U-turn.
      </p>

      {error && (
        <div className="mb-2 rounded border border-red-500 bg-red-50 px-2 py-1.5 text-[11px] text-red-700">
          {error}
        </div>
      )}

      {pendingList.map((entry, i) => (
        <div key={i} className="mb-2 rounded border border-neutral-300 bg-white p-2">
          <div className="mb-1.5 flex items-center gap-1.5">
            <span className="flex-1 text-xs font-semibold">
              {entry.isUturn ? '↩' : '↪'} {entry.destRoadName ?? entry.destRoadId}
            </span>
            <button className="rounded border border-neutral-300 bg-neutral-100 px-2 py-1 text-[10px] font-medium hover:bg-neutral-200" onClick={() => removeEntry(i)}>X</button>
          </div>

          {entry.nodeOptions.length > 1 && (
            <div className="mb-1.5">
              <label className="mb-0.5 block text-[11px] text-neutral-600">
                {entry.isUturn ? 'Endpoint node:' : 'Junction node:'}
              </label>
              <select
                className="w-full rounded border border-neutral-300 px-2 py-1 text-[11px]"
                value={entry.selectedNodeId}
                onChange={e => updateEntry(i, { selectedNodeId: e.target.value })}
              >
                <option value="">— select node —</option>
                {entry.nodeOptions.map(opt => (
                  <option key={opt.nodeId} value={opt.nodeId}>{opt.nodeName}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="mb-0.5 block text-[11px] text-neutral-600">
              {entry.isUturn ? 'Re-entering on section:' : 'Entering on section:'}
            </label>
            {entry.sections.length === 0 ? (
              <p className="text-[11px] text-red-700">Road has no sections.</p>
            ) : entry.selectedSectionIdx === '' ? (
              <p className="text-[11px] text-red-700">Click the section on the canvas.</p>
            ) : (
              <p className="text-[11px]">
                {entry.sections[parseInt(entry.selectedSectionIdx, 10)]?.name
                  ?? `Section ${entry.sections[parseInt(entry.selectedSectionIdx, 10)]?.index + 1}`}
              </p>
            )}
          </div>
        </div>
      ))}

      <div className="flex flex-col gap-1">
        {pendingList.length > 0 && (
          <button
            className="w-full rounded bg-[#18a0fb] px-3 py-2 font-medium text-white hover:bg-[#0d8ee0] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canCommit}
            onClick={handleCommit}
          >
            Add {pendingList.length === 1 ? 'road' : `${pendingList.length} roads`}
          </button>
        )}
        <button className="w-full rounded border border-neutral-300 bg-neutral-100 px-3 py-2 font-medium hover:bg-neutral-200" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
};

export default RseAddingPanel;
