import React, { useEffect, useState } from 'react';
import { postMessageToPlugin } from '../../figma';
import Button from '../common/Button';
import { useLinesContext } from '../../contexts/LinesContext';
import LineInfoEditor from './LineInfoEditor';
import PathEditor from './PathEditor';

const EditLinePathSection: React.FC = () => {
  const {
    lines, currentEditingLineId, setCurrentEditingLineId, setIsEditorDirty,
    pendingLineSwitch, confirmPendingLineSwitch, cancelPendingLineSwitch,
  } = useLinesContext();
  const currentLine = lines.find(l => l.id === currentEditingLineId);

  const [infoDirty, setInfoDirty] = useState(false);
  const [pathDirty, setPathDirty] = useState(false);
  const isDirty = infoDirty || pathDirty;
  useEffect(() => { setIsEditorDirty(isDirty); }, [isDirty, setIsEditorDirty]);
  // Safety net: if this unmounts some other way, don't leave the context's dirty
  // flag stuck true forever.
  useEffect(() => () => setIsEditorDirty(false), [setIsEditorDirty]);

  return (
    <div className="mb-4 border-b border-neutral-200 pb-4">
      <div className="mb-4 flex items-center gap-2">
        <Button onClick={() => setCurrentEditingLineId(null)}>
          &lt; Back
        </Button>
        <h3 className="flex-1 text-sm font-semibold">Edit Line Path</h3>
      </div>

      {pendingLineSwitch && (
        <div className="mb-2 flex items-center gap-1.5 rounded border border-red-300 bg-red-50 px-2 py-1 text-[11px] text-red-700">
          <span className="flex-1">
            {pendingLineSwitch.target === null ? 'Discard unsaved changes and go back?' : 'Discard unsaved changes and switch lines?'}
          </span>
          <Button size="xs" variant="danger" onClick={confirmPendingLineSwitch}>Discard</Button>
          <Button size="xs" onClick={cancelPendingLineSwitch}>Stay here</Button>
        </div>
      )}

      {currentLine && (
        <LineInfoEditor
          line={currentLine}
          onApply={(name, color) => {
            if (!currentEditingLineId) return;
            postMessageToPlugin({ type: 'patch-line', lineId: currentEditingLineId, patch: { op: 'update-info', name, color } });
          }}
          onDirtyChange={setInfoDirty}
        />
      )}

      <PathEditor onDirtyChange={setPathDirty} />
    </div>
  );
};

export default EditLinePathSection;
