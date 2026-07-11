import React, { useState } from 'react';
import { LineAtRoadSectionData, NetworkFocusedElement, NodeData } from '@/common/messages';
import { RoadId, RoadSectionId } from '@/common/types';
import { postMessageToPlugin } from '../../figma';
import { useNetworkContext } from '../../contexts/NetworkContext';
import Button from '../common/Button';
import ConfirmButton from '../common/ConfirmButton';
import DraggableLineList from '../DraggableLineList';
import { useStagedOrder } from '../common/useStagedOrder';

const FocusedRoadPanel: React.FC<{
  element: Extract<NetworkFocusedElement, { kind: 'road' }>;
  nodes: NodeData[];
}> = ({ element, nodes }) => {
  const [sectionName, setSectionName] = useState('');
  const { roadLinesData: lines } = useNetworkContext();

  const startNode = nodes.find(n => n.id === element.startNodeId);
  const endNode   = nodes.find(n => n.id === element.endNodeId);

  const handleAddSection = () => {
    postMessageToPlugin({ type: 'patch-road', roadId: element.roadId, patch: { op: 'add-section', section: { name: sectionName.trim() || undefined, index: element.sections.length } } });
    setSectionName('');
  };

  const sectionIdKey = (id: RoadSectionId) => id.join(':');

  return (
    <div className="mb-3 rounded bg-[#e8f4ff] p-2 text-xs">
      <div className="mb-1 flex items-center">
        <span className="flex-1 font-semibold">Selected Road</span>
        <Button size="sm" onClick={() => postMessageToPlugin({ type: 'remove-road', roadId: element.roadId })}>
          Delete
        </Button>
      </div>
      <div>{element.name ?? element.roadId}</div>
      <div className="mt-0.5 text-neutral-500">
        {startNode?.name ?? `junction #${element.startNodeId}`} → {endNode?.name ?? `junction #${element.endNodeId}`}
      </div>
      <div className="mt-1 mb-2 text-[11px] text-neutral-400">Drag the blue handles on the canvas to adjust the curve.</div>

      <div className="border-t border-[#d0e4f7] pt-2">
        <label className="mb-1 block text-[11px] text-neutral-500">Sections</label>
        {element.sections.length === 0 && <p className="mb-2 text-[11px] text-neutral-400">No sections yet.</p>}
        {element.sections.map(section => (
          <div key={section.id.join(':')} className="mb-1 flex items-center gap-2">
            <span className="flex-1">{section.name ?? `Section ${section.index}`}</span>
            <Button size="sm" onClick={() => postMessageToPlugin({ type: 'patch-road', roadId: element.roadId, patch: { op: 'remove-section', sectionId: section.id } })}>×</Button>
          </div>
        ))}
        <input className="my-1 w-full rounded border border-neutral-300 px-2 py-1 text-xs" placeholder="Section name (optional)" value={sectionName} onChange={e => setSectionName(e.target.value)} />
        <Button fullWidth onClick={handleAddSection}>+ Add Section</Button>
      </div>

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
              roadId={element.roadId}
              sectionId={section.id}
              sectionLabel={section.name ?? `Section ${section.index}`}
              lines={lines.filter(l => sectionIdKey(l.sectionId) === sectionIdKey(section.id))}
            />
          ))}
        </div>
      )}
    </div>
  );
};

interface SectionRankListsProps {
  roadId: RoadId;
  sectionId: RoadSectionId;
  sectionLabel: string;
  lines: LineAtRoadSectionData[];
}

const SectionRankLists: React.FC<SectionRankListsProps> = ({ roadId, sectionId, sectionLabel, lines }) => {
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
          <SideRankList key={side} roadId={roadId} sectionId={sectionId} side={side} items={items} />
        ))}
      </div>
    </div>
  );
};

const sideItemKey = (item: LineAtRoadSectionData) => `${item.lineId}-${item.passIndex}-${item.end}`;

const SideRankList: React.FC<{ roadId: RoadId; sectionId: RoadSectionId; side: 0 | 1; items: LineAtRoadSectionData[] }> = ({ roadId, sectionId, side, items }) => {
  const { order, setOrder, isDirty, cancel } = useStagedOrder(items, sideItemKey);

  const handleApply = () => {
    const changes = order.map((it, i) => ({ lineId: it.lineId, passIndex: it.passIndex, end: it.end, rank: i }));
    postMessageToPlugin({ type: 'patch-road', roadId, patch: { op: 'update-section-ranks', sectionId, side, changes } });
  };

  return (
    <div>
      <DraggableLineList
        items={order}
        getKey={sideItemKey}
        getLineColor={item => item.lineColor}
        getLineName={item => item.lineName}
        showRank
        onCommit={setOrder}
      />
      {isDirty && (
        <div className="mt-1 grid grid-cols-2 gap-1.5">
          <Button size="xs" variant="primary" onClick={handleApply}>Apply</Button>
          <ConfirmButton size="xs" label="Cancel" onConfirm={cancel} prompt="Discard reorder?" confirmLabel="Discard" keepLabel="Keep" />
        </div>
      )}
    </div>
  );
};

export default FocusedRoadPanel;
