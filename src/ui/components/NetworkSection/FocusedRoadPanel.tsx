import React, { useState } from 'react';
import { LineAtRoadSectionData, NetworkFocusedElement, NodeData } from '@/common/messages';
import { RoadId, RoadSectionId } from '@/common/types';
import { postMessageToPlugin } from '../../figma';
import { useNetworkContext } from '../../contexts/NetworkContext';
import Button from '../common/Button';
import DraggableLineList from '../DraggableLineList';

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
          {element.sections.map(section => (
            <SectionRankLists
              key={sectionIdKey(section.id)}
              roadId={element.roadId}
              sectionId={section.id}
              sectionLabel={section.name ?? `Section ${section.index}`}
              startLabel={startNode?.name ?? `junction #${element.startNodeId}`}
              endLabel={endNode?.name ?? `junction #${element.endNodeId}`}
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
  startLabel: string;
  endLabel: string;
  lines: LineAtRoadSectionData[];
}

const SectionRankLists: React.FC<SectionRankListsProps> = ({ roadId, sectionId, sectionLabel, startLabel, endLabel, lines }) => (
  <>
    {([0, 1] as const).map(side => {
      const items = lines.filter(l => l.side === side).sort((a, b) => a.rank - b.rank);
      if (items.length === 0) return null;
      return (
        <div className="mt-2" key={side}>
          <label className="text-neutral-600">{sectionLabel} — {side === 0 ? startLabel : endLabel} side (drag to reorder)</label>
          <div className="mt-1">
            <DraggableLineList
              items={items}
              getKey={item => `${item.lineId}-${item.passIndex}-${item.end}`}
              getLineColor={item => item.lineColor}
              getLineName={item => item.lineName}
              showRank
              onCommit={newItems => {
                const changes = newItems.map((it, i) => ({ lineId: it.lineId, passIndex: it.passIndex, end: it.end, rank: i }));
                postMessageToPlugin({ type: 'patch-road', roadId, patch: { op: 'update-section-ranks', sectionId, side, changes } });
              }}
            />
          </div>
        </div>
      );
    })}
  </>
);

export default FocusedRoadPanel;
