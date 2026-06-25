import React, { useState } from 'react';
import { LineAtNodeData, NetworkFocusedElement } from '@/common/messages';
import { NodeId, RoadSectionId } from '@/common/types';
import { postMessageToPlugin } from '../../figma';
import { useNetworkContext } from '../../contexts/NetworkContext';
import DraggableLineList from '../DraggableLineList';

type ArmItem = { line: LineAtNodeData; role: 'exit' | 'enter'; rank: number };

const FocusedNodePanel: React.FC<{ element: Extract<NetworkFocusedElement, { kind: 'node' }> }> = ({ element }) => {
  const [editName, setEditName] = useState(element.name ?? '');
  const { roads, nodeLinesData: lines } = useNetworkContext();

  const commitName = () => {
    const trimmed = editName.trim() || undefined;
    if (trimmed !== element.name) {
      postMessageToPlugin({ type: 'patch-node', nodeId: element.nodeId, patch: { op: 'update-name', name: trimmed } });
    }
  };

  const getSectionLabel = (sectionId: RoadSectionId | null): string => {
    if (!sectionId) return '(none)';
    for (const road of roads) {
      const sec = road.sections.find(s => s.id[0] === sectionId[0] && s.id[1] === sectionId[1]);
      if (sec) return sec.name ? `${road.name ?? road.id} / ${sec.name}` : road.name ?? road.id;
    }
    return sectionId.join(':');
  };

  const allSectionIds = [
    ...new Set([
      ...lines.map(l => l.exitingSectionId),
      ...lines.map(l => l.enteringSectionId),
    ].filter(Boolean) as RoadSectionId[]),
  ];

  return (
    <div style={{ padding: '8px', background: '#e8f4ff', borderRadius: '4px', marginBottom: '12px', fontSize: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '6px' }}>
        <span style={{ fontWeight: 600, flex: 1 }}>Selected Junction</span>
        <button className="button button--secondary small-btn" onClick={() => postMessageToPlugin({ type: 'remove-node', nodeId: element.nodeId })}>
          Delete
        </button>
      </div>
      <input
        className="input"
        placeholder="Junction name (optional)"
        value={editName}
        onChange={e => setEditName(e.target.value)}
        onBlur={commitName}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        style={{ marginBottom: '4px' }}
      />
      <div style={{ color: '#666', marginTop: '2px' }}>x: {element.pos.x.toFixed(1)},&nbsp; y: {element.pos.y.toFixed(1)}</div>
      <div style={{ color: '#999', fontSize: '11px', marginTop: '4px' }}>Drag the junction marker on the canvas to move it.</div>

      {allSectionIds.map(sectionId => {
        const items: ArmItem[] = [
          ...lines.filter(l => l.exitingSectionId === sectionId).map(l => ({ line: l, role: 'exit' as const, rank: l.exitRank })),
          ...lines.filter(l => l.enteringSectionId === sectionId).map(l => ({ line: l, role: 'enter' as const, rank: l.enterRank })),
        ].sort((a, b) => a.rank - b.rank);

        return (
          <NodeArmList
            key={sectionId.join(':')}
            label={`${getSectionLabel(sectionId)} (drag to reorder)`}
            nodeId={element.nodeId}
            items={items}
          />
        );
      })}
    </div>
  );
};

interface NodeArmListProps {
  label: string;
  nodeId: NodeId;
  items: ArmItem[];
}

const NodeArmList: React.FC<NodeArmListProps> = ({ label, nodeId, items }) => (
  <div style={{ marginTop: '8px' }}>
    <label style={{ color: '#555' }}>{label}</label>
    <div style={{ marginTop: '4px' }}>
      <DraggableLineList
        items={items}
        getKey={item => `${item.line.lineId}-${item.line.pathIndex}-${item.role}`}
        getLineColor={item => item.line.lineColor}
        getLineName={item => item.line.lineName}
        showRank
        right={item => (
          <span style={{ color: '#aaa', fontSize: '11px' }}>
            {item.role === 'exit' ? 'exit' : 'enter'}
          </span>
        )}
        onCommit={items => {
          const changes = items.map((it, i) => ({
            lineId: it.line.lineId,
            pathIndex: it.line.pathIndex,
            exitRank: it.role === 'exit' ? i : it.line.exitRank,
            enterRank: it.role === 'enter' ? i : it.line.enterRank,
          }));
          postMessageToPlugin({ type: 'patch-node', nodeId, patch: { op: 'update-rsc-ranks', changes } });
        }}
      />
    </div>
  </div>
);

export default FocusedNodePanel;
