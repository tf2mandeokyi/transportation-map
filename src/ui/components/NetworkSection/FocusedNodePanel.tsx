import React, { useCallback, useEffect, useState } from 'react';
import { LineAtNodeData, NetworkFocusedElement } from '@/common/messages';
import { RoadSectionId } from '@/common/types';
import { postMessageToPlugin } from '../../figma';
import { useNetworkDataContext, useNetworkSessionContext } from '../../contexts/NetworkContext';
import Button from '../common/Button';
import ConfirmButton from '../common/ConfirmButton';
import DraggableLineList from '../DraggableLineList';
import SortOrderButtons from '../common/SortOrderButtons';
import { sortByLineOrder } from '../common/sortByLineOrder';
import { useStagedOrder } from '../common/useStagedOrder';
import { useLinesContext } from '../../contexts/LinesContext';

type ArmItem = { line: LineAtNodeData; role: 'exit' | 'enter'; rank: number };

// Registry of pending rank-list reorders (one entry per dirty arm list), keyed so a
// panel-level Apply/Cancel bar can commit or discard all of them at once — as a single
// patch-node message/render/undo-step, not one per list. update-pass-ranks changes aren't
// tied to a section, so merging is just concatenation.
type RankChanges = Array<{ lineId: LineAtNodeData['lineId']; passIndex: number; end: 'from' | 'to'; rank: number }>;
type RankEntry = { getChanges: () => RankChanges; cancel: () => void };

const FocusedNodePanel: React.FC<{ element: Extract<NetworkFocusedElement, { kind: 'node' }> }> = ({ element }) => {
  const [editName, setEditName] = useState(element.name ?? '');
  const { roads } = useNetworkDataContext();
  const { nodeLinesData: lines } = useNetworkSessionContext();

  const [rankRegistry, setRankRegistry] = useState<Record<string, RankEntry>>({});
  const registerRank = useCallback((key: string, entry: RankEntry | null) => {
    setRankRegistry(prev => {
      if (entry === null) {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: entry };
    });
  }, []);
  const dirtyRankKeys = Object.keys(rankRegistry);
  const handleApplyAllRanks = () => {
    const entries = Object.values(rankRegistry);
    if (entries.length === 0) return;
    const changes = entries.flatMap(e => e.getChanges());
    postMessageToPlugin({ type: 'patch-node', nodeId: element.nodeId, patch: { op: 'update-pass-ranks', changes } });
  };
  const handleCancelAllRanks = () => Object.values(rankRegistry).forEach(e => e.cancel());

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
                sectionKey={key}
                items={items}
                registerRank={registerRank}
              />
            );
          })}
        </React.Fragment>
      ))}
      {dirtyRankKeys.length > 0 && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Button size="sm" variant="primary" onClick={handleApplyAllRanks}>Apply Ranks</Button>
          <ConfirmButton size="sm" label="Cancel" onConfirm={handleCancelAllRanks} prompt="Discard rank changes?" confirmLabel="Discard" keepLabel="Keep editing" />
        </div>
      )}
    </div>
  );
};

interface NodeArmListProps {
  label: string;
  sectionKey: string;
  items: ArmItem[];
  registerRank: (key: string, entry: RankEntry | null) => void;
}

const armKey = (item: ArmItem) => `${item.line.lineId}-${item.role === 'exit' ? item.line.exitingPassIndex : item.line.enteringPassIndex}-${item.role}`;

const NodeArmList: React.FC<NodeArmListProps> = ({ label, sectionKey, items, registerRank }) => {
  const { order, setOrder, isDirty, cancel } = useStagedOrder(items, armKey);
  const { lines: lineList } = useLinesContext();

  const orderKey = order.map(armKey).join('|');
  useEffect(() => {
    if (!isDirty) {
      registerRank(sectionKey, null);
      return;
    }
    registerRank(sectionKey, {
      getChanges: () => {
        const changes: RankChanges = [];
        order.forEach((it, i) => {
          if (it.role === 'exit' && it.line.exitingPassIndex !== null) {
            changes.push({ lineId: it.line.lineId, passIndex: it.line.exitingPassIndex, end: 'to', rank: i });
          } else if (it.role === 'enter' && it.line.enteringPassIndex !== null) {
            changes.push({ lineId: it.line.lineId, passIndex: it.line.enteringPassIndex, end: 'from', rank: i });
          }
        });
        return changes;
      },
      cancel,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionKey, isDirty, orderKey]);
  useEffect(() => () => registerRank(sectionKey, null), [sectionKey, registerRank]);

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
    </div>
  );
};

export default FocusedNodePanel;
