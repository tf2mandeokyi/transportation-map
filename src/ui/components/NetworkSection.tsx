import React, { useState } from 'react';
import { NodeId } from '@/common/types';
import { NetworkFocusedElement, NodeData } from '@/common/messages';
import { postMessageToPlugin } from '../figma';

type RoadCreationStep = 'idle' | 'first' | 'second';

// ─── Focused element panels ────────────────────────────────────────────────

interface FocusedNodePanelProps {
  element: Extract<NetworkFocusedElement, { kind: 'node' }>;
}

const FocusedNodePanel: React.FC<FocusedNodePanelProps> = ({ element }) => (
  <div style={{ padding: '8px', background: '#e8f4ff', borderRadius: '4px', marginBottom: '12px', fontSize: '12px' }}>
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
      <span style={{ fontWeight: 600, flex: 1 }}>Selected Junction</span>
      <button
        className="button button--secondary small-btn"
        onClick={() => postMessageToPlugin({ type: 'remove-node', nodeId: element.nodeId })}
      >Delete</button>
    </div>
    <div>{element.name ?? element.nodeId}</div>
    <div style={{ color: '#666', marginTop: '2px' }}>
      x: {element.pos.x.toFixed(1)},&nbsp; y: {element.pos.y.toFixed(1)}
    </div>
    <div style={{ color: '#999', fontSize: '11px', marginTop: '4px' }}>
      Drag the junction marker on the canvas to move it.
    </div>
  </div>
);

interface FocusedRoadPanelProps {
  element: Extract<NetworkFocusedElement, { kind: 'road' }>;
  nodes: NodeData[];
}

const FocusedRoadPanel: React.FC<FocusedRoadPanelProps> = ({ element, nodes }) => {
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
        <button
          className="button button--secondary small-btn"
          onClick={() => postMessageToPlugin({ type: 'remove-road', roadId: element.roadId })}
        >Delete</button>
      </div>
      <div>{element.name ?? element.roadId}</div>
      <div style={{ color: '#666', marginTop: '2px' }}>
        {startNode?.name ?? element.startNodeId} → {endNode?.name ?? element.endNodeId}
      </div>
      <div style={{ color: '#999', fontSize: '11px', marginTop: '4px', marginBottom: '8px' }}>
        Drag the blue handles on the canvas to adjust the curve.
      </div>

      <div style={{ borderTop: '1px solid #d0e4f7', paddingTop: '8px' }}>
        <label style={{ fontSize: '11px', color: '#666', display: 'block', marginBottom: '4px' }}>Sections</label>
        {element.sections.length === 0 && (
          <p style={{ color: '#999', fontSize: '11px', margin: '0 0 8px 0' }}>No sections yet.</p>
        )}
        {element.sections.map(section => (
          <div key={section.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ flex: 1 }}>
              {section.name ?? `Section ${section.index}`}
            </span>
            <button
              className="button button--secondary small-btn"
              onClick={() => postMessageToPlugin({ type: 'remove-road-section', roadId: element.roadId, sectionId: section.id })}
            >×</button>
          </div>
        ))}
        <input
          className="input"
          placeholder="Section name (optional)"
          value={sectionName}
          onChange={e => setSectionName(e.target.value)}
          style={{ marginBottom: '4px', marginTop: '4px' }}
        />
        <button className="button button--secondary" style={{ width: '100%' }} onClick={handleAddSection}>
          + Add Section
        </button>
      </div>
    </div>
  );
};

// ─── Add forms ─────────────────────────────────────────────────────────────

const NodeForm: React.FC = () => {
  const [name, setName] = useState('');
  const [x, setX]       = useState('0');
  const [y, setY]       = useState('0');

  const handleAdd = () => {
    const px = Number.parseFloat(x);
    const py = Number.parseFloat(y);
    if (Number.isNaN(px) || Number.isNaN(py)) return;
    postMessageToPlugin({ type: 'add-node', node: { name: name.trim() || undefined, pos: { x: px, y: py } } });
    setName(''); setX('0'); setY('0');
  };

  return (
    <div className="grid">
      <input className="input" placeholder="Junction name (optional)" value={name} onChange={e => setName(e.target.value)} />
      <div className="two-column">
        <div><label>X</label><input className="input" type="number" value={x} onChange={e => setX(e.target.value)} /></div>
        <div><label>Y</label><input className="input" type="number" value={y} onChange={e => setY(e.target.value)} /></div>
      </div>
      <button className="button button--primary" onClick={handleAdd}>Add Junction</button>
    </div>
  );
};

interface RoadCreatorProps {
  step: RoadCreationStep;
  firstNode: { id: NodeId; name?: string } | null;
  onStart: () => void;
  onCancel: () => void;
}

const RoadCreator: React.FC<RoadCreatorProps> = ({ step, firstNode, onStart, onCancel }) => {
  if (step === 'idle') {
    return <button className="button button--primary" style={{ width: '100%' }} onClick={onStart}>Add Road</button>;
  }
  return (
    <div style={{ fontSize: '12px' }}>
      <div style={{ padding: '8px', background: '#fff8e1', borderRadius: '4px', marginBottom: '8px' }}>
        {step === 'first' && <span style={{ color: '#666' }}>Click the <strong>start</strong> junction on the canvas…</span>}
        {step === 'second' && (
          <>
            <div style={{ color: '#333', marginBottom: '4px' }}>
              Start: <strong>{firstNode?.name ?? firstNode?.id}</strong>
            </div>
            <span style={{ color: '#666' }}>Click the <strong>end</strong> junction on the canvas…</span>
          </>
        )}
      </div>
      <button className="button button--secondary" style={{ width: '100%' }} onClick={onCancel}>Cancel</button>
    </div>
  );
};

// ─── Root ──────────────────────────────────────────────────────────────────

interface Props {
  nodes: NodeData[];
  focusedElement: NetworkFocusedElement | null;
  roadCreationStep: RoadCreationStep;
  roadCreationFirstNode: { id: NodeId; name?: string } | null;
  onStartRoadCreation: () => void;
  onCancelRoadCreation: () => void;
}

const NetworkSection: React.FC<Props> = ({
  nodes, focusedElement,
  roadCreationStep, roadCreationFirstNode,
  onStartRoadCreation, onCancelRoadCreation,
}) => (
  <div>
    {focusedElement?.kind === 'node' && <FocusedNodePanel element={focusedElement} />}
    {focusedElement?.kind === 'road' && <FocusedRoadPanel element={focusedElement} nodes={nodes} />}

    <div className="section">
      <h3>Add Junction</h3>
      <NodeForm />
    </div>

    <div className="section">
      <h3>Add Road</h3>
      <RoadCreator
        step={roadCreationStep}
        firstNode={roadCreationFirstNode}
        onStart={onStartRoadCreation}
        onCancel={onCancelRoadCreation}
      />
    </div>
  </div>
);

export default NetworkSection;
