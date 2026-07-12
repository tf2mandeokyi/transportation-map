import React, { useState } from 'react';
import { LineAtNodeData, NetworkFocusedElement } from '@/common/messages';
import { NodeId, RoadSectionId } from '@/common/types';
import { postMessageToPlugin } from '../../figma';
import { useNetworkContext } from '../../contexts/NetworkContext';
import Button from '../common/Button';
import ConfirmButton from '../common/ConfirmButton';
import DraggableLineList from '../DraggableLineList';
import SortOrderButtons from '../common/SortOrderButtons';
import { sortByLineOrder } from '../common/sortByLineOrder';
import { useStagedOrder } from '../common/useStagedOrder';
import { useLinesContext } from '../../contexts/LinesContext';

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
        <Button size="sm" onClick={() => postMessageToPlugin({ type: 'remove-node', nodeId: element.nodeId })}>
          Delete
        </Button>
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

const armKey = (item: ArmItem) => `${item.line.lineId}-${item.role === 'exit' ? item.line.exitingPassIndex : item.line.enteringPassIndex}-${item.role}`;

const NodeArmList: React.FC<NodeArmListProps> = ({ label, nodeId, items }) => {
  const { order, setOrder, isDirty, cancel } = useStagedOrder(items, armKey);
  const { lines: lineList } = useLinesContext();

  const handleApply = () => {
    const changes: Array<{ lineId: LineAtNodeData['lineId']; passIndex: number; end: 'from' | 'to'; rank: number }> = [];
    order.forEach((it, i) => {
      if (it.role === 'exit' && it.line.exitingPassIndex !== null) {
        changes.push({ lineId: it.line.lineId, passIndex: it.line.exitingPassIndex, end: 'to', rank: i });
      } else if (it.role === 'enter' && it.line.enteringPassIndex !== null) {
        changes.push({ lineId: it.line.lineId, passIndex: it.line.enteringPassIndex, end: 'from', rank: i });
      }
    });
    postMessageToPlugin({ type: 'patch-node', nodeId, patch: { op: 'update-pass-ranks', changes } });
  };

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between gap-2">
        <label className="text-neutral-600">{label}</label>
        <SortOrderButtons onSort={reverse => setOrder(sortByLineOrder(order, lineList, it => it.line.lineId, reverse))} />
      </div>
      <div className="mt-1">
        <DraggableLineList
          items={order}
          getKey={armKey}
          getLineColor={item => item.line.lineColor}
          getLineName={item => item.line.lineName}
          showRank
          right={item => (
            <span className="text-[11px] text-neutral-400">
              {item.role === 'exit' ? 'exit' : 'enter'}
            </span>
          )}
          onCommit={setOrder}
        />
      </div>
      {isDirty && (
        <div className="mt-1 grid grid-cols-2 gap-2">
          <Button size="sm" variant="primary" onClick={handleApply}>Apply</Button>
          <ConfirmButton size="sm" label="Cancel" onConfirm={cancel} prompt="Discard reorder?" confirmLabel="Discard" keepLabel="Keep" />
        </div>
      )}
    </div>
  );
};

export default FocusedNodePanel;
