import React from 'react';
import { LineData } from '@/common/messages';

const LineInfoEditor: React.FC<{
  line: LineData;
  onUpdateName: (name: string) => void;
  onUpdateColor: (color: string) => void;
}> = ({ line, onUpdateName, onUpdateColor }) => (
  <div className="flex flex-col gap-2">
    <div className="grid grid-cols-2 gap-2">
      <div>
        <label htmlFor="edit-line-name" className="mb-1 block font-medium select-none">Line Name</label>
        <input className="w-full rounded border border-neutral-300 px-2 py-1 text-xs" id="edit-line-name" type="text" value={line.name} onChange={(e) => onUpdateName(e.target.value)} />
      </div>
      <div>
        <label htmlFor="edit-line-color" className="mb-1 block font-medium select-none">Color</label>
        <input className="w-full rounded border border-neutral-300 px-2 py-1 text-xs" id="edit-line-color" type="color" value={line.color} onChange={(e) => onUpdateColor(e.target.value)} />
      </div>
    </div>
  </div>
);

export default LineInfoEditor;
