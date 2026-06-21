import React, { useEffect, useRef, useState } from 'react';
import { NodeId, RoadId, RoadSectionId } from '@/common/types';
import { useMessageManager } from '../../contexts/MessageContext';
import { useNetworkContext } from '../../contexts/NetworkContext';

interface RseAddingPanelProps {
  afterPathIndex: number;
  sourceRoadId: RoadId | null;
  exitingSectionId: RoadSectionId | null;
  onCommitRse: (afterPathIndex: number, exitingSectionId: RoadSectionId | null, nodeId: NodeId, enteringSectionId: RoadSectionId | null) => void;
  onCancel: () => void;
}

const RseAddingPanel: React.FC<RseAddingPanelProps> = ({ afterPathIndex, sourceRoadId, exitingSectionId, onCommitRse, onCancel }) => {
  const manager = useMessageManager();
  const { roads, nodes } = useNetworkContext();

  const [rseError, setRseError]           = useState<string | null>(null);
  const [rseNodeOptions, setRseNodeOptions] = useState<Array<{ nodeId: NodeId; nodeName: string }> | null>(null);
  const [rsePendingRoadId, setRsePendingRoadId] = useState<RoadId | null>(null);
  const [rseSelectedNodeId, setRseSelectedNodeId] = useState<NodeId | ''>('');

  // Ref-based handler so the stable subscription always sees latest props/state.
  const handleRef = useRef<(destRoadId: RoadId) => void>(() => {});
  handleRef.current = (destRoadId: RoadId) => {
    if (!sourceRoadId) {
      setRseError('No road context at this position.');
      return;
    }
    if (sourceRoadId === destRoadId) {
      setRseError('That is the same road the line is already on.');
      return;
    }

    const sourceRoad = roads.find(r => r.id === sourceRoadId);
    const destRoad   = roads.find(r => r.id === destRoadId);
    if (!sourceRoad || !destRoad) return;

    const sourceNodeIds = new Set([sourceRoad.startNodeId, sourceRoad.endNodeId]);
    const sharedNodes = ([destRoad.startNodeId, destRoad.endNodeId] as NodeId[])
      .filter(n => sourceNodeIds.has(n))
      .map(nodeId => {
        const node = nodes.find(n => n.id === nodeId);
        return { nodeId, nodeName: node?.name ?? nodeId };
      });

    if (sharedNodes.length === 0) {
      setRseError('Roads are not directly connected by a shared junction.');
      return;
    }

    setRseError(null);

    if (sharedNodes.length === 1) {
      const enteringSectionId = (destRoad.sections[0]?.id ?? null) as RoadSectionId | null;
      onCommitRse(afterPathIndex, exitingSectionId, sharedNodes[0].nodeId, enteringSectionId);
      return;
    }

    setRseNodeOptions(sharedNodes);
    setRsePendingRoadId(destRoadId);
    setRseSelectedNodeId('');
  };

  useEffect(() => {
    return manager.onMessage('road-clicked', msg => handleRef.current(msg.roadId));
  }, [manager]);

  return (
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
              if (exitingSectionId && rseSelectedNodeId && rsePendingRoadId) {
                const pendingDest = roads.find(r => r.id === rsePendingRoadId);
                const enteringSectionId = (pendingDest?.sections[0]?.id ?? null) as RoadSectionId | null;
                onCommitRse(afterPathIndex, exitingSectionId, rseSelectedNodeId as NodeId, enteringSectionId);
              }
            }}
          >
            Add Road Junction
          </button>
        </div>
      )}
      <button className="button button--secondary" style={{ width: '100%' }} onClick={onCancel}>Cancel</button>
    </div>
  );
};

export default RseAddingPanel;
