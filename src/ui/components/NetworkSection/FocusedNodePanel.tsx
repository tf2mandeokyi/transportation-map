import React, { useState } from 'react';
import { NetworkFocusedElement } from '@/common/messages';
import { postMessageToPlugin } from '../../figma';

const FocusedNodePanel: React.FC<{ element: Extract<NetworkFocusedElement, { kind: 'node' }> }> = ({ element }) => {
  const [editName, setEditName] = useState(element.name ?? '');

  const commitName = () => {
    const trimmed = editName.trim() || undefined;
    if (trimmed !== element.name) {
      postMessageToPlugin({ type: 'patch-node', nodeId: element.nodeId, patch: { op: 'update-name', name: trimmed } });
    }
  };

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
    </div>
  );
};

export default FocusedNodePanel;
