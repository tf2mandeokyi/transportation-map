import React from 'react';
import { postMessageToPlugin } from '../../figma';
import { useLinesContext } from '../../contexts/LinesContext';
import LineInfoEditor from './LineInfoEditor';
import PathEditor from './PathEditor';

const EditLinePathSection: React.FC = () => {
  const { lines, currentEditingLineId, setCurrentEditingLineId } = useLinesContext();
  const currentLine = lines.find(l => l.id === currentEditingLineId);

  return (
    <div className="mb-4 border-b border-neutral-200 pb-4">
      <div className="mb-4 flex items-center gap-2">
        <button className="rounded border border-neutral-300 bg-neutral-100 px-3 py-2 font-medium hover:bg-neutral-200" onClick={() => setCurrentEditingLineId(null)}>
          &lt; Back
        </button>
        <h3 className="flex-1 text-sm font-semibold">Edit Line Path</h3>
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
