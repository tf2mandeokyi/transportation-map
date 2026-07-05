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
    className="flex cursor-grab items-center justify-between rounded border border-neutral-200 px-2"
    draggable
    onDragStart={(e) => onDragStart(e, index)}
    onDragOver={(e) => onDragOver(e, index)}
    onDrop={onDrop}
    onClick={() => onEdit(line.id)}
  >
    <div className="flex flex-1 cursor-pointer items-center" title="Click to edit line path">
      <span className="mr-2 text-xs text-neutral-400">⋮⋮</span>
      <div className="mr-2 h-5 w-5 rounded-full" style={{ backgroundColor: line.color }}></div>
      <span className="flex-1 font-medium">{line.name}</span>
    </div>
    <div className="flex gap-1">
      <button
        className="rounded border border-neutral-300 bg-neutral-100 px-2 py-1 text-[10px] font-medium hover:bg-neutral-200"
        onClick={(e) => { e.stopPropagation(); onRemove(line.id); }}
      >
        Remove
      </button>
    </div>
  </div>
);

export default LineItem;
