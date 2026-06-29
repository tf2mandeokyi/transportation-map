import React, { useEffect, useRef, useState } from 'react';
import { NodeId, RoadId, RoadSectionId } from '@/common/types';
import { RoadSectionData } from '@/common/messages';
import { useMessageManager } from '../../contexts/MessageContext';
import { useNetworkContext } from '../../contexts/NetworkContext';

interface RseAddingPanelProps {
  afterPathIndex: number;
  sourceRoadId: RoadId | null;
  exitingSectionId: RoadSectionId | null;
  onCommitRse: (afterPathIndex: number, exitingSectionId: RoadSectionId | null, nodeId: NodeId, enteringSectionId: RoadSectionId | null) => void;
  onCancel: () => void;
}

type PendingConfig = {
  isUturn: boolean;
  nodeOptions: Array<{ nodeId: NodeId; nodeName: string }>;
  sections: RoadSectionData[];
  preselectedNodeId: NodeId | null;
  preselectedSectionIndex: number;
};

const RseAddingPanel: React.FC<RseAddingPanelProps> = ({
  afterPathIndex, sourceRoadId, exitingSectionId, onCommitRse, onCancel,
}) => {
  const manager = useMessageManager();
  const { roads, nodes } = useNetworkContext();

  const [error, setError]                       = useState<string | null>(null);
  const [pending, setPending]                   = useState<PendingConfig | null>(null);
  const [selectedNodeId, setSelectedNodeId]     = useState<string>('');
  const [selectedSectionIdx, setSelectedSectionIdx] = useState<string>('');

  const handleRef = useRef<(destRoadId: RoadId) => void>(() => {});
  handleRef.current = (destRoadId: RoadId) => {
    const destRoad = roads.find(r => r.id === destRoadId);
    if (!destRoad) return;

    setError(null);

    if (sourceRoadId === destRoadId) {
      // U-turn: same road — pick endpoint node + section to re-enter
      const nodeOptions = ([destRoad.startNodeId, destRoad.endNodeId] as NodeId[]).map(nodeId => ({
        nodeId,
        nodeName: nodes.find(n => n.id === nodeId)?.name ?? nodeId,
      }));
      const exitingIdx = exitingSectionId
        ? destRoad.sections.findIndex(s => s.id[1] === exitingSectionId[1])
        : 0;
      const preselectedSectionIndex = exitingIdx >= 0 ? exitingIdx : 0;
      setPending({ isUturn: true, nodeOptions, sections: destRoad.sections, preselectedNodeId: null, preselectedSectionIndex });
      setSelectedNodeId('');
      setSelectedSectionIdx(String(preselectedSectionIndex));
      return;
    }

    if (!sourceRoadId) {
      setError('No road context at this position.');
      return;
    }

    const sourceRoad = roads.find(r => r.id === sourceRoadId);
    if (!sourceRoad) return;

    const sourceNodeIds = new Set([sourceRoad.startNodeId, sourceRoad.endNodeId]);
    const sharedNodes = ([destRoad.startNodeId, destRoad.endNodeId] as NodeId[])
      .filter(n => sourceNodeIds.has(n))
      .map(nodeId => ({ nodeId, nodeName: nodes.find(n => n.id === nodeId)?.name ?? nodeId }));

    if (sharedNodes.length === 0) {
      setError('Roads are not directly connected by a shared junction.');
      return;
    }

    const preselectedNodeId = sharedNodes.length === 1 ? sharedNodes[0].nodeId : null;
    setPending({ isUturn: false, nodeOptions: sharedNodes, sections: destRoad.sections, preselectedNodeId, preselectedSectionIndex: 0 });
    setSelectedNodeId(preselectedNodeId ?? '');
    setSelectedSectionIdx(destRoad.sections.length > 0 ? '0' : '');
  };

  useEffect(() => {
    return manager.onMessage('road-clicked', msg => handleRef.current(msg.roadId));
  }, [manager]);

  const handleCommit = () => {
    if (!pending) return;
    const nodeId = selectedNodeId as NodeId;
    const idx = parseInt(selectedSectionIdx, 10);
    const enteringSectionId = pending.sections[idx]?.id ?? null;
    onCommitRse(afterPathIndex, exitingSectionId, nodeId, enteringSectionId);
  };

  const canCommit = !!selectedNodeId && selectedSectionIdx !== '';

  return (
    <div style={{ padding: '12px', background: '#f5f5f5', borderRadius: '4px', border: '2px solid #18a0fb', marginTop: '8px' }}>
      <p style={{ fontSize: '11px', color: '#666', margin: '0 0 8px 0' }}>
        <strong>Adding road junction</strong><br />
        Click a road on the canvas. Click the same road to create a U-turn.
      </p>

      {error && (
        <div style={{ fontSize: '11px', color: '#c00', background: '#fff0f0', border: '1px solid #f00', borderRadius: '3px', padding: '6px 8px', marginBottom: '8px' }}>
          {error}
        </div>
      )}

      {pending && (
        <div style={{ marginBottom: '8px' }}>
          <p style={{ fontSize: '11px', fontWeight: 600, color: '#333', margin: '0 0 6px 0' }}>
            {pending.isUturn ? '↩ U-turn — configure:' : '↪ Junction — configure:'}
          </p>

          {pending.nodeOptions.length > 1 && (
            <div style={{ marginBottom: '6px' }}>
              <label style={{ fontSize: '11px', color: '#555', display: 'block', marginBottom: '2px' }}>
                {pending.isUturn ? 'Endpoint node:' : 'Junction node:'}
              </label>
              <select
                className="input"
                value={selectedNodeId}
                onChange={e => setSelectedNodeId(e.target.value)}
                style={{ fontSize: '11px', width: '100%' }}
              >
                <option value="">— select node —</option>
                {pending.nodeOptions.map(opt => (
                  <option key={opt.nodeId} value={opt.nodeId}>{opt.nodeName}</option>
                ))}
              </select>
            </div>
          )}

          <div style={{ marginBottom: '8px' }}>
            <label style={{ fontSize: '11px', color: '#555', display: 'block', marginBottom: '2px' }}>
              {pending.isUturn ? 'Re-enter on section:' : 'Enter on section:'}
            </label>
            {pending.sections.length === 0 ? (
              <p style={{ fontSize: '11px', color: '#c00', margin: 0 }}>Road has no sections.</p>
            ) : (
              <select
                className="input"
                value={selectedSectionIdx}
                onChange={e => setSelectedSectionIdx(e.target.value)}
                style={{ fontSize: '11px', width: '100%' }}
              >
                <option value="">— select section —</option>
                {pending.sections.map((s, idx) => (
                  <option key={idx} value={String(idx)}>
                    {s.name ?? `Section ${s.index + 1}`}
                  </option>
                ))}
              </select>
            )}
          </div>

          <button
            className="button button--primary"
            disabled={!canCommit}
            style={{ width: '100%', marginBottom: '4px' }}
            onClick={handleCommit}
          >
            {pending.isUturn ? 'Add U-turn' : 'Add Junction'}
          </button>
        </div>
      )}

      <button className="button button--secondary" style={{ width: '100%' }} onClick={onCancel}>Cancel</button>
    </div>
  );
};

export default RseAddingPanel;
