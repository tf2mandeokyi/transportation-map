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
    <div style={{ padding: '12px', background: '#f5f5f5', borderRadius: '4px', border: '2px solid #18a0fb', marginTop: '8px' }}>
      <p style={{ fontSize: '11px', color: '#666', margin: '0 0 8px 0' }}>
        <strong>Adding roads</strong><br />
        Click roads on the canvas. Click the same road to add a U-turn.
      </p>

      {error && (
        <div style={{ fontSize: '11px', color: '#c00', background: '#fff0f0', border: '1px solid #f00', borderRadius: '3px', padding: '6px 8px', marginBottom: '8px' }}>
          {error}
        </div>
      )}

      {pendingList.map((entry, i) => (
        <div key={i} style={{ marginBottom: '8px', padding: '8px', background: '#fff', borderRadius: '4px', border: '1px solid #ddd' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, flex: 1 }}>
              {entry.isUturn ? '↩' : '↪'} {entry.destRoadName ?? entry.destRoadId}
            </span>
            <button className="button button--secondary small-btn" onClick={() => removeEntry(i)}>X</button>
          </div>

          {entry.nodeOptions.length > 1 && (
            <div style={{ marginBottom: '6px' }}>
              <label style={{ fontSize: '11px', color: '#555', display: 'block', marginBottom: '2px' }}>
                {entry.isUturn ? 'Endpoint node:' : 'Junction node:'}
              </label>
              <select
                className="input"
                value={entry.selectedNodeId}
                onChange={e => updateEntry(i, { selectedNodeId: e.target.value })}
                style={{ fontSize: '11px', width: '100%' }}
              >
                <option value="">— select node —</option>
                {entry.nodeOptions.map(opt => (
                  <option key={opt.nodeId} value={opt.nodeId}>{opt.nodeName}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label style={{ fontSize: '11px', color: '#555', display: 'block', marginBottom: '2px' }}>
              {entry.isUturn ? 'Re-entering on section:' : 'Entering on section:'}
            </label>
            {entry.sections.length === 0 ? (
              <p style={{ fontSize: '11px', color: '#c00', margin: 0 }}>Road has no sections.</p>
            ) : entry.selectedSectionIdx === '' ? (
              <p style={{ fontSize: '11px', color: '#c00', margin: 0 }}>Click the section on the canvas.</p>
            ) : (
              <p style={{ fontSize: '11px', margin: 0 }}>
                {entry.sections[parseInt(entry.selectedSectionIdx, 10)]?.name
                  ?? `Section ${entry.sections[parseInt(entry.selectedSectionIdx, 10)]?.index + 1}`}
              </p>
            )}
          </div>
        </div>
      ))}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {pendingList.length > 0 && (
          <button
            className="button button--primary"
            disabled={!canCommit}
            style={{ width: '100%' }}
            onClick={handleCommit}
          >
            Add {pendingList.length === 1 ? 'road' : `${pendingList.length} roads`}
          </button>
        )}
        <button className="button button--secondary" style={{ width: '100%' }} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
};

export default RseAddingPanel;
