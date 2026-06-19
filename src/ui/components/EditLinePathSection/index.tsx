import React from 'react';
import { postMessageToPlugin } from '../../figma';
import { useLinesContext } from '../../contexts/LinesContext';
import LineInfoEditor from './LineInfoEditor';
import PathEditor from './PathEditor';

const EditLinePathSection: React.FC = () => {
  const { lines, currentEditingLineId, setCurrentEditingLineId } = useLinesContext();
  const currentLine = lines.find(l => l.id === currentEditingLineId);

  return (
    <div className="section">
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <button className="button button--secondary" onClick={() => setCurrentEditingLineId(null)} style={{ padding: '8px 12px' }}>
          &lt; Back
        </button>
        <h3 style={{ margin: 0, flex: 1 }}>Edit Line Path</h3>
      </div>

      {currentLine && (
        <LineInfoEditor
          line={currentLine}
          onUpdateName={(name) => {
            if (currentEditingLineId && name.trim()) {
              postMessageToPlugin({ type: 'patch-line', lineId: currentEditingLineId, patch: { op: 'update-name', name: name.trim() } });
            }
          }}
          onUpdateColor={(color) => {
            if (currentEditingLineId) {
              postMessageToPlugin({ type: 'patch-line', lineId: currentEditingLineId, patch: { op: 'update-color', color } });
            }
          }}
        />
      )}

      <PathEditor />
    </div>
  );
};

export default EditLinePathSection;
