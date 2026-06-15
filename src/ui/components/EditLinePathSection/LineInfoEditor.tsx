import React from 'react';
import { LineData } from '@/common/messages';

const LineInfoEditor: React.FC<{
  line: LineData;
  onUpdateName: (name: string) => void;
  onUpdateColor: (color: string) => void;
}> = ({ line, onUpdateName, onUpdateColor }) => (
  <div className="grid">
    <div className="two-column">
      <div>
        <label htmlFor="edit-line-name">Line Name</label>
        <input className="input" id="edit-line-name" type="text" value={line.name} onChange={(e) => onUpdateName(e.target.value)} />
      </div>
      <div>
        <label htmlFor="edit-line-color">Color</label>
        <input className="input" id="edit-line-color" type="color" value={line.color} onChange={(e) => onUpdateColor(e.target.value)} />
      </div>
    </div>
  </div>
);

export default LineInfoEditor;
