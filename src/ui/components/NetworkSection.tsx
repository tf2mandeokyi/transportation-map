import React, { useState } from 'react';
import { NetworkFocusedElement, NodeData } from '@/common/messages';
import { postMessageToPlugin } from '../figma';
import { useNetworkContext } from '../contexts/NetworkContext';

// ─── Focused element panels ────────────────────────────────────────────────

const FocusedNodePanel: React.FC<{ element: Extract<NetworkFocusedElement, { kind: 'node' }> }> = ({ element }) => {
  const [editName, setEditName] = useState(element.name ?? '');

  const commitName = () => {
    const trimmed = editName.trim() || undefined;
    if (trimmed !== element.name) {
      postMessageToPlugin({ type: 'update-node-name', nodeId: element.nodeId, name: trimmed });
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

const FocusedRoadPanel: React.FC<{
  element: Extract<NetworkFocusedElement, { kind: 'road' }>;
  nodes: NodeData[];
}> = ({ element, nodes }) => {
  const [sectionName, setSectionName] = useState('');

  const startNode = nodes.find(n => n.id === element.startNodeId);
  const endNode   = nodes.find(n => n.id === element.endNodeId);

  const handleAddSection = () => {
    postMessageToPlugin({
      type: 'add-road-section',
      roadId: element.roadId,
      section: { name: sectionName.trim() || undefined, index: element.sections.length },
    });
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
          <div key={section.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ flex: 1 }}>{section.name ?? `Section ${section.index}`}</span>
            <button className="button button--secondary small-btn" onClick={() => postMessageToPlugin({ type: 'remove-road-section', roadId: element.roadId, sectionId: section.id })}>×</button>
          </div>
        ))}
        <input className="input" placeholder="Section name (optional)" value={sectionName} onChange={e => setSectionName(e.target.value)} style={{ marginBottom: '4px', marginTop: '4px' }} />
        <button className="button button--secondary" style={{ width: '100%' }} onClick={handleAddSection}>+ Add Section</button>
      </div>
    </div>
  );
};

// ─── Add forms ─────────────────────────────────────────────────────────────

const NodeForm: React.FC = () => {
  const [name, setName] = useState('');

  const handleAdd = () => {
    postMessageToPlugin({ type: 'add-node', node: { name: name.trim() || undefined } });
    setName('');
  };

  return (
    <div className="grid">
      <input className="input" placeholder="Junction name (optional)" value={name} onChange={e => setName(e.target.value)} />
      <button className="button button--primary" onClick={handleAdd}>Add Junction</button>
    </div>
  );
};

const RoadCreator: React.FC = () => {
  const { roadCreationStep, roadCreationFirstNode, handleStartRoadCreation, handleCancelRoadCreation } = useNetworkContext();

  if (roadCreationStep === 'idle') {
    return <button className="button button--primary" style={{ width: '100%' }} onClick={handleStartRoadCreation}>Add Road</button>;
  }

  return (
    <div style={{ fontSize: '12px' }}>
      <div style={{ padding: '8px', background: '#fff8e1', borderRadius: '4px', marginBottom: '8px' }}>
        {roadCreationStep === 'first' && <span style={{ color: '#666' }}>Click the <strong>start</strong> junction on the canvas…</span>}
        {roadCreationStep === 'second' && (
          <>
            <div style={{ color: '#333', marginBottom: '4px' }}>Start: <strong>{roadCreationFirstNode?.name ?? roadCreationFirstNode?.id}</strong></div>
            <span style={{ color: '#666' }}>Click the <strong>end</strong> junction on the canvas…</span>
          </>
        )}
      </div>
      <button className="button button--secondary" style={{ width: '100%' }} onClick={handleCancelRoadCreation}>Cancel</button>
    </div>
  );
};

// ─── Root ──────────────────────────────────────────────────────────────────

const NetworkSection: React.FC = () => {
  const { nodes, networkFocus } = useNetworkContext();

  return (
    <div>
      {networkFocus?.kind === 'node' && <FocusedNodePanel key={networkFocus.nodeId} element={networkFocus} />}
      {networkFocus?.kind === 'road' && <FocusedRoadPanel element={networkFocus} nodes={nodes} />}

      <div className="section">
        <h3>Add Junction</h3>
        <NodeForm />
      </div>

      <div className="section">
        <h3>Add Road</h3>
        <RoadCreator />
      </div>
    </div>
  );
};

export default NetworkSection;
