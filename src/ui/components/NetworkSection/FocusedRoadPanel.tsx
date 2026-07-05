import React, { useState } from 'react';
import { NetworkFocusedElement, NodeData } from '@/common/messages';
import { postMessageToPlugin } from '../../figma';

const FocusedRoadPanel: React.FC<{
  element: Extract<NetworkFocusedElement, { kind: 'road' }>;
  nodes: NodeData[];
}> = ({ element, nodes }) => {
  const [sectionName, setSectionName] = useState('');

  const startNode = nodes.find(n => n.id === element.startNodeId);
  const endNode   = nodes.find(n => n.id === element.endNodeId);

  const handleAddSection = () => {
    postMessageToPlugin({ type: 'patch-road', roadId: element.roadId, patch: { op: 'add-section', section: { name: sectionName.trim() || undefined, index: element.sections.length } } });
    setSectionName('');
  };

  return (
    <div className="mb-3 rounded bg-[#e8f4ff] p-2 text-xs">
      <div className="mb-1 flex items-center">
        <span className="flex-1 font-semibold">Selected Road</span>
        <button className="rounded border border-neutral-300 bg-neutral-100 px-2 py-1 text-[10px] font-medium hover:bg-neutral-200" onClick={() => postMessageToPlugin({ type: 'remove-road', roadId: element.roadId })}>
          Delete
        </button>
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
            <button className="rounded border border-neutral-300 bg-neutral-100 px-2 py-1 text-[10px] font-medium hover:bg-neutral-200" onClick={() => postMessageToPlugin({ type: 'patch-road', roadId: element.roadId, patch: { op: 'remove-section', sectionId: section.id } })}>×</button>
          </div>
        ))}
        <input className="my-1 w-full rounded border border-neutral-300 px-2 py-1 text-xs" placeholder="Section name (optional)" value={sectionName} onChange={e => setSectionName(e.target.value)} />
        <button className="w-full rounded border border-neutral-300 bg-neutral-100 px-3 py-2 font-medium hover:bg-neutral-200" onClick={handleAddSection}>+ Add Section</button>
      </div>
    </div>
  );
};

export default FocusedRoadPanel;
