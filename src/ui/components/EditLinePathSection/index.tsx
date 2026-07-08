import React, { useRef } from 'react';
import { postMessageToPlugin } from '../../figma';
import Button from '../common/Button';
import { useLinesContext } from '../../contexts/LinesContext';
import LineInfoEditor from './LineInfoEditor';
import PathEditor, { PathEditorHandle } from './PathEditor';

const EditLinePathSection: React.FC = () => {
  const { lines, currentEditingLineId, setCurrentEditingLineId } = useLinesContext();
  const currentLine = lines.find(l => l.id === currentEditingLineId);
  const pathEditorRef = useRef<PathEditorHandle>(null);

  const handleBack = () => {
    pathEditorRef.current?.flushPendingToggles();
    setCurrentEditingLineId(null);
  };

  return (
    <div className="mb-4 border-b border-neutral-200 pb-4">
      <div className="mb-4 flex items-center gap-2">
        <Button onClick={handleBack}>
          &lt; Back
        </Button>
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

      <PathEditor ref={pathEditorRef} />
    </div>
  );
};

export default EditLinePathSection;
