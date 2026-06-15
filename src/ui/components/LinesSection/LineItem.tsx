import React from 'react';
import { LineId } from '@/common/types';
import { LineData } from '@/common/messages';

export interface LineItemProps {
  line: LineData;
  index: number;
  onRemove: (lineId: LineId) => void;
  onEdit: (lineId: LineId) => void;
  onDragStart: (e: React.DragEvent, index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDrop: (e: React.DragEvent) => void;
}

const LineItem: React.FC<LineItemProps> = ({ line, index, onRemove, onEdit, onDragStart, onDragOver, onDrop }) => (
  <div
    className="line-item"
    draggable
    onDragStart={(e) => onDragStart(e, index)}
    onDragOver={(e) => onDragOver(e, index)}
    onDrop={onDrop}
    onClick={() => onEdit(line.id)}
    style={{ cursor: 'grab' }}
  >
    <div style={{ display: 'flex', alignItems: 'center', flex: 1, cursor: 'pointer' }} title="Click to edit line path">
      <span style={{ marginRight: '8px', color: '#999', fontSize: '12px' }}>⋮⋮</span>
      <div className="line-color" style={{ backgroundColor: line.color }}></div>
      <span className="line-info">{line.name}</span>
    </div>
    <div className="line-controls">
      <button
        className="button button--secondary small-btn"
        onClick={(e) => { e.stopPropagation(); onRemove(line.id); }}
      >
        Remove
      </button>
    </div>
  </div>
);

export default LineItem;
