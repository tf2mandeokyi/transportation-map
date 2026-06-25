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
    <div style={{ padding: '8px', background: '#e8f4ff', borderRadius: '4px', marginBottom: '12px', fontSize: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
        <span style={{ fontWeight: 600, flex: 1 }}>Selected Road</span>
        <button className="button button--secondary small-btn" onClick={() => postMessageToPlugin({ type: 'remove-road', roadId: element.roadId })}>
          Delete
        </button>
      </div>
      <div>{element.name ?? element.roadId}</div>
      <div style={{ color: '#666', marginTop: '2px' }}>{startNode?.name ?? element.startNodeId} → {endNode?.name ?? element.endNodeId}</div>
      <div style={{ color: '#999', fontSize: '11px', marginTop: '4px', marginBottom: '8px' }}>Drag the blue handles on the canvas to adjust the curve.</div>

      <div style={{ borderTop: '1px solid #d0e4f7', paddingTop: '8px' }}>
        <label style={{ fontSize: '11px', color: '#666', display: 'block', marginBottom: '4px' }}>Sections</label>
        {element.sections.length === 0 && <p style={{ color: '#999', fontSize: '11px', margin: '0 0 8px 0' }}>No sections yet.</p>}
        {element.sections.map(section => (
          <div key={section.id.join(':')} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ flex: 1 }}>{section.name ?? `Section ${section.index}`}</span>
            <button className="button button--secondary small-btn" onClick={() => postMessageToPlugin({ type: 'patch-road', roadId: element.roadId, patch: { op: 'remove-section', sectionId: section.id } })}>×</button>
          </div>
        ))}
        <input className="input" placeholder="Section name (optional)" value={sectionName} onChange={e => setSectionName(e.target.value)} style={{ marginBottom: '4px', marginTop: '4px' }} />
        <button className="button button--secondary" style={{ width: '100%' }} onClick={handleAddSection}>+ Add Section</button>
      </div>
    </div>
  );
};

export default FocusedRoadPanel;
