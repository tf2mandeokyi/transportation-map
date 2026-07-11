import React, { useEffect, useState } from 'react';
import { LineData } from '@/common/messages';
import Button from '../common/Button';
import ConfirmButton from '../common/ConfirmButton';

const LineInfoEditor: React.FC<{
  line: LineData;
  onApply: (name: string, color: string) => void;
  // Reported on every dirty/clean transition so the surrounding Edit Line Path
  // panel's Back/switch-line guard also catches unapplied name/color edits.
  onDirtyChange: (dirty: boolean) => void;
}> = ({ line, onApply, onDirtyChange }) => {
  const [name, setName]   = useState(line.name);
  const [color, setColor] = useState(line.color);

  // Sync local state when server state changes — either a different line is now
  // being edited, or our own Apply just echoed back as the new prop values.
  useEffect(() => {
    setName(line.name);
    setColor(line.color);
  }, [line.name, line.color]);

  const isDirty = name !== line.name || color !== line.color;
  useEffect(() => { onDirtyChange(isDirty); }, [isDirty, onDirtyChange]);

  const handleCancelEdits = () => {
    setName(line.name);
    setColor(line.color);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor="edit-line-name" className="mb-1 block font-medium select-none">Line Name</label>
          <input className="w-full rounded border border-neutral-300 px-2 py-1 text-xs" id="edit-line-name" type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label htmlFor="edit-line-color" className="mb-1 block font-medium select-none">Color</label>
          <input className="w-full rounded border border-neutral-300 px-2 py-1 text-xs" id="edit-line-color" type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="primary" disabled={!isDirty || !name.trim()} onClick={() => onApply(name.trim(), color)}>
          Apply
        </Button>
        <ConfirmButton
          label="Cancel"
          onConfirm={handleCancelEdits}
          skipConfirm={!isDirty}
          prompt="Discard unsaved changes?"
          confirmLabel="Discard"
          keepLabel="Keep editing"
        />
      </div>
    </div>
  );
};

export default LineInfoEditor;
