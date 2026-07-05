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

  const sectionIdKey = (id: RoadSectionId) => id.join(':');

  const findRoadAndSection = (sectionId: RoadSectionId) => {
    for (const road of roads) {
      const sec = road.sections.find(s => s.id[0] === sectionId[0] && s.id[1] === sectionId[1]);
      if (sec) return { road, sec };
    }
    return null;
  };

  const allSectionIds = [
    ...new Map([
      ...lines.map(l => l.exitingSectionId),
      ...lines.map(l => l.enteringSectionId),
    ].filter(Boolean).map(id => [sectionIdKey(id as RoadSectionId), id as RoadSectionId])).values(),
  ];

  // Group arms by their parent road so sections of the same road appear together.
  const roadGroups: Array<{ roadKey: string; roadLabel: string; sectionIds: RoadSectionId[] }> = [];
  for (const sectionId of allSectionIds) {
    const found = findRoadAndSection(sectionId);
    const roadKey = found ? found.road.id : `unknown:${sectionIdKey(sectionId)}`;
    const roadLabel = found ? (found.road.name ?? `road #${found.road.id}`) : `road #${sectionId[0]}`;
    let group = roadGroups.find(g => g.roadKey === roadKey);
    if (!group) {
      group = { roadKey, roadLabel, sectionIds: [] };
      roadGroups.push(group);
    }
    group.sectionIds.push(sectionId);
  }

  const getSectionLabel = (sectionId: RoadSectionId): string => {
    const found = findRoadAndSection(sectionId);
    return found?.sec.name ?? `section #${found?.sec.index ?? sectionId[1]}`;
  };

  return (
    <div className="mb-3 rounded bg-[#e8f4ff] p-2 text-xs">
      <div className="mb-1.5 flex items-center">
        <span className="flex-1 font-semibold">Selected Junction</span>
        <button className="rounded border border-neutral-300 bg-neutral-100 px-2 py-1 text-[10px] font-medium hover:bg-neutral-200" onClick={() => postMessageToPlugin({ type: 'remove-node', nodeId: element.nodeId })}>
          Delete
        </button>
      </div>
      <input
        className="mb-1 w-full rounded border border-neutral-300 px-2 py-1 text-xs"
        placeholder="Junction name (optional)"
        value={editName}
        onChange={e => setEditName(e.target.value)}
        onBlur={commitName}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      />
      <div className="mt-0.5 text-neutral-500">x: {element.pos.x.toFixed(1)},&nbsp; y: {element.pos.y.toFixed(1)}</div>
      <div className="mt-1 text-[11px] text-neutral-400">Drag the junction marker on the canvas to move it.</div>

      {roadGroups.map((group, gi) => (
        <React.Fragment key={group.roadKey}>
          {gi > 0 && <hr className="my-2.5 mb-1 border-t border-[#d0e4f7]" />}
          <div className="mt-1.5 font-semibold text-neutral-600">{group.roadLabel}</div>
          {group.sectionIds.map(sectionId => {
            const key = sectionIdKey(sectionId);
            const items: ArmItem[] = [
              ...lines.filter(l => l.exitingSectionId && sectionIdKey(l.exitingSectionId) === key).map(l => ({ line: l, role: 'exit' as const, rank: l.exitRank })),
              ...lines.filter(l => l.enteringSectionId && sectionIdKey(l.enteringSectionId) === key).map(l => ({ line: l, role: 'enter' as const, rank: l.enterRank })),
            ].sort((a, b) => a.rank - b.rank);

            return (
              <NodeArmList
                key={key}
                label={`${getSectionLabel(sectionId)} (drag to reorder)`}
                nodeId={element.nodeId}
                items={items}
              />
            );
          })}
        </React.Fragment>
      ))}
    </div>
  );
};

interface NodeArmListProps {
  label: string;
  nodeId: NodeId;
  items: ArmItem[];
}

const NodeArmList: React.FC<NodeArmListProps> = ({ label, nodeId, items }) => (
  <div className="mt-2">
    <label className="text-neutral-600">{label}</label>
    <div className="mt-1">
      <DraggableLineList
        items={items}
        getKey={item => `${item.line.lineId}-${item.line.groupIndex}-${item.role}`}
        getLineColor={item => item.line.lineColor}
        getLineName={item => item.line.lineName}
        showRank
        right={item => (
          <span className="text-[11px] text-neutral-400">
            {item.role === 'exit' ? 'exit' : 'enter'}
          </span>
        )}
        onCommit={items => {
          const changes = items.map((it, i) => ({
            lineId: it.line.lineId,
            groupIndex: it.line.groupIndex,
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
