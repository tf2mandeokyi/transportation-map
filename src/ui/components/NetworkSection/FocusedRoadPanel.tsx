import React, { useCallback, useEffect, useRef, useState } from 'react';
import { LineAtRoadSectionData, NetworkFocusedElement, NodeData, RoadSectionData } from '@/common/messages';
import { LineId, RoadSectionId } from '@/common/types';
import { postMessageToPlugin } from '../../figma';
import { useNetworkContext } from '../../contexts/NetworkContext';
import Button from '../common/Button';
import ConfirmButton from '../common/ConfirmButton';
import DraggableLineList from '../DraggableLineList';
import SortOrderButtons from '../common/SortOrderButtons';
import { sortByLineOrder } from '../common/sortByLineOrder';
import { useStagedOrder } from '../common/useStagedOrder';
import { useLinesContext } from '../../contexts/LinesContext';

const sectionIdKey = (id: RoadSectionId) => id.join(':');

// A staged section row — either an existing section (id set) or one added locally
// and not yet sent to the plugin (id null, only a locally-unique tempKey).
type SectionDraft = { id: RoadSectionId | null; tempKey: string; name: string };

const toDrafts = (sections: RoadSectionData[]): SectionDraft[] =>
  sections.map(s => ({ id: s.id, tempKey: sectionIdKey(s.id), name: s.name ?? '' }));

// Registry of pending rank-list reorders (one entry per dirty side/section list), keyed
// so a panel-level Apply/Cancel bar can commit or discard all of them at once — as a
// single patch-road message/render/undo-step, not one per list.
type RankChanges = { lineId: LineId; passIndex: number; end: 'from' | 'to'; rank: number }[];
type RankEntry = { sectionId: RoadSectionId; side: 0 | 1; getChanges: () => RankChanges; cancel: () => void };

const FocusedRoadPanel: React.FC<{
  element: Extract<NetworkFocusedElement, { kind: 'road' }>;
  nodes: NodeData[];
}> = ({ element, nodes }) => {
  const { roadLinesData: lines } = useNetworkContext();

  const [editName, setEditName] = useState(element.name ?? '');
  const [sectionDrafts, setSectionDrafts] = useState<SectionDraft[]>(() => toDrafts(element.sections));
  const nextTempIdRef = useRef(0);

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
    postMessageToPlugin({
      type: 'patch-road',
      roadId: element.roadId,
      patch: {
        op: 'update-ranks-batch',
        sections: entries.map(e => ({ sectionId: e.sectionId, side: e.side, changes: e.getChanges() })),
      },
    });
  };
  const handleCancelAllRanks = () => Object.values(rankRegistry).forEach(e => e.cancel());

  const startNode = nodes.find(n => n.id === element.startNodeId);
  const endNode   = nodes.find(n => n.id === element.endNodeId);

  // Re-sync staged name/sections whenever the server's copy actually changes — e.g.
  // after Apply round-trips — not on every render (a fresh-but-equal sections array).
  const serverSectionsKey = element.sections.map(s => `${sectionIdKey(s.id)}:${s.name ?? ''}`).join('|');
  useEffect(() => {
    setEditName(element.name ?? '');
    setSectionDrafts(toDrafts(element.sections));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [element.roadId, element.name, serverSectionsKey]);

  const originalDrafts = toDrafts(element.sections);
  const isSectionsDirty =
    sectionDrafts.length !== originalDrafts.length ||
    sectionDrafts.some((d, i) => d.tempKey !== originalDrafts[i]?.tempKey || d.name !== originalDrafts[i]?.name);
  const isNameDirty = editName !== (element.name ?? '');
  const isDirty = isNameDirty || isSectionsDirty;

  const handleAddSectionDraft = () => {
    setSectionDrafts(prev => [...prev, { id: null, tempKey: `new-${nextTempIdRef.current++}`, name: '' }]);
  };

  const handleRemoveSectionDraft = (tempKey: string) => {
    setSectionDrafts(prev => prev.filter(d => d.tempKey !== tempKey));
  };

  const handleSectionNameChange = (tempKey: string, name: string) => {
    setSectionDrafts(prev => prev.map(d => d.tempKey === tempKey ? { ...d, name } : d));
  };

  const handleApply = () => {
    postMessageToPlugin({
      type: 'patch-road',
      roadId: element.roadId,
      patch: {
        op: 'apply',
        name: editName.trim() || undefined,
        sections: sectionDrafts.map(d => ({ id: d.id ? d.id[1] : null, name: d.name.trim() || undefined })),
      },
    });
  };

  const handleCancel = () => {
    setEditName(element.name ?? '');
    setSectionDrafts(toDrafts(element.sections));
  };

  return (
    <div className="mb-3 rounded bg-[#e8f4ff] p-2 text-xs">
      <div className="mb-1 flex items-center">
        <span className="flex-1 font-semibold">Selected Road</span>
        <Button size="sm" onClick={() => postMessageToPlugin({ type: 'remove-road', roadId: element.roadId })}>
          Delete
        </Button>
      </div>
      <input
        className="mb-1 w-full rounded border border-neutral-300 px-2 py-1 text-xs"
        placeholder="Road name (optional)"
        value={editName}
        onChange={e => setEditName(e.target.value)}
      />
      <div className="mt-0.5 text-neutral-500">
        {startNode?.name ?? `junction #${element.startNodeId}`} → {endNode?.name ?? `junction #${element.endNodeId}`}
      </div>
      <div className="mt-1 mb-2 text-[11px] text-neutral-400">Drag the blue handles on the canvas to adjust the curve.</div>

      <div className="border-t border-[#d0e4f7] pt-2">
        <label className="mb-1 block text-[11px] text-neutral-500">Sections</label>
        {sectionDrafts.length === 0 && <p className="mb-2 text-[11px] text-neutral-400">No sections yet.</p>}
        {sectionDrafts.map((draft, i) => {
          const original = element.sections.find(s => sectionIdKey(s.id) === draft.tempKey);
          const placeholder = original ? `Section ${original.index}` : `Section ${i} (new)`;
          return (
            <div key={draft.tempKey} className="mb-1 flex items-center gap-2">
              <input
                className="flex-1 rounded border border-neutral-300 px-2 py-1 text-xs"
                placeholder={placeholder}
                value={draft.name}
                onChange={e => handleSectionNameChange(draft.tempKey, e.target.value)}
              />
              <Button size="sm" onClick={() => handleRemoveSectionDraft(draft.tempKey)}>×</Button>
            </div>
          );
        })}
        <Button fullWidth onClick={handleAddSectionDraft}>+ Add Section</Button>
      </div>

      {isDirty && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Button variant="primary" onClick={handleApply}>Apply</Button>
          <ConfirmButton label="Cancel" onConfirm={handleCancel} prompt="Discard unsaved changes?" confirmLabel="Discard" keepLabel="Keep editing" />
        </div>
      )}

      {element.sections.length > 0 && (
        <div className="mt-2 border-t border-[#d0e4f7] pt-2">
          <label className="mb-1 block text-[11px] text-neutral-500">Line Ranks</label>
          <div className="grid grid-cols-2 gap-2">
            <span className="truncate text-[11px] text-neutral-400">{startNode?.name ?? `junction #${element.startNodeId}`}</span>
            <span className="truncate text-[11px] text-neutral-400">{endNode?.name ?? `junction #${element.endNodeId}`}</span>
          </div>
          {element.sections.map(section => (
            <SectionRankLists
              key={sectionIdKey(section.id)}
              sectionId={section.id}
              sectionLabel={section.name ?? `Section ${section.index}`}
              lines={lines.filter(l => sectionIdKey(l.sectionId) === sectionIdKey(section.id))}
              registerRank={registerRank}
            />
          ))}
          {dirtyRankKeys.length > 0 && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button variant="primary" onClick={handleApplyAllRanks}>Apply Ranks</Button>
              <ConfirmButton label="Cancel" onConfirm={handleCancelAllRanks} prompt="Discard rank changes?" confirmLabel="Discard" keepLabel="Keep editing" />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface SectionRankListsProps {
  sectionId: RoadSectionId;
  sectionLabel: string;
  lines: LineAtRoadSectionData[];
  registerRank: (key: string, entry: RankEntry | null) => void;
}

const SectionRankLists: React.FC<SectionRankListsProps> = ({ sectionId, sectionLabel, lines, registerRank }) => {
  const sides = ([0, 1] as const).map(side => ({
    side,
    items: lines.filter(l => l.side === side).sort((a, b) => a.rank - b.rank),
  })).filter(s => s.items.length > 0);

  if (sides.length === 0) return null;

  return (
    <div className="mt-2">
      <label className="text-neutral-600">{sectionLabel} (drag to reorder)</label>
      <div className="mt-1 grid grid-cols-2 gap-2">
        {sides.map(({ side, items }) => (
          <SideRankList key={side} sectionId={sectionId} side={side} items={items} registerRank={registerRank} />
        ))}
      </div>
    </div>
  );
};

const sideItemKey = (item: LineAtRoadSectionData) => `${item.lineId}-${item.passIndex}-${item.end}`;

const SideRankList: React.FC<{
  sectionId: RoadSectionId;
  side: 0 | 1;
  items: LineAtRoadSectionData[];
  registerRank: (key: string, entry: RankEntry | null) => void;
}> = ({ sectionId, side, items, registerRank }) => {
  const { order, setOrder, isDirty, cancel } = useStagedOrder(items, sideItemKey);
  const { lines: lineList } = useLinesContext();

  const registryKey = `${sectionIdKey(sectionId)}:${side}`;
  const orderKey = order.map(sideItemKey).join('|');
  useEffect(() => {
    if (!isDirty) {
      registerRank(registryKey, null);
      return;
    }
    registerRank(registryKey, {
      sectionId,
      side,
      getChanges: () => order.map((it, i) => ({ lineId: it.lineId, passIndex: it.passIndex, end: it.end, rank: i })),
      cancel,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registryKey, isDirty, orderKey]);
  useEffect(() => () => registerRank(registryKey, null), [registryKey, registerRank]);

  return (
    <div>
      <div className="mb-1">
        <SortOrderButtons onSort={reverse => setOrder(sortByLineOrder(order, lineList, it => it.lineId, reverse))} />
      </div>
      <DraggableLineList
        items={order}
        getKey={sideItemKey}
        getLineColor={item => item.lineColor}
        getLineName={item => item.lineName}
        showRank
        onCommit={setOrder}
      />
    </div>
  );
};

export default FocusedRoadPanel;
