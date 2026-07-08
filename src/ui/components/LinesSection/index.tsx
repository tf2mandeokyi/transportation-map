import React, { useState } from 'react';
import { LineId } from '@/common/types';
import { postMessageToPlugin } from '../../figma';
import Button from '../common/Button';
import { useLinesContext } from '../../contexts/LinesContext';
import LineItem from './LineItem';

const LinesSection: React.FC = () => {
  const { lines, setCurrentEditingLineId, removeLine, reorderLines } = useLinesContext();
  const [lineName, setLineName]           = useState('');
  const [lineColor, setLineColor]         = useState('#ff0000');
  const [lineIsCircular, setLineIsCircular] = useState(false);
  const [lineCounter, setLineCounter]     = useState(0);
  const [draggedIndex, setDraggedIndex]   = useState<number | null>(null);

  const handleAddLine = () => {
    postMessageToPlugin({ type: 'add-line', line: { name: lineName || `Line_${lineCounter}`, color: lineColor, isCircular: lineIsCircular } });
    setLineName('');
    setLineIsCircular(false);
    setLineCounter(prev => prev + 1);
  };

  const handleRemoveLine = (lineId: LineId) => {
    postMessageToPlugin({ type: 'remove-line', lineId });
    removeLine(lineId);
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedIndex === null || draggedIndex === index) return;

    const newLines = [...lines];
    const [dragged] = newLines.splice(draggedIndex, 1);
    newLines.splice(index, 0, dragged);
    reorderLines(newLines);
    setDraggedIndex(index);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (draggedIndex === null) return;
    postMessageToPlugin({ type: 'update-line-stacking-order', lineIds: lines.map(l => l.id) });
    setDraggedIndex(null);
  };

  return (
    <div className="mb-4 border-b border-neutral-200 pb-4">
      <h3 className="mb-3 text-sm font-semibold">Lines</h3>
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="line-name" className="mb-1 block font-medium select-none">Line Name</label>
            <input className="w-full rounded border border-neutral-300 px-2 py-1 text-xs" id="line-name" type="text" placeholder="Line A" value={lineName} onChange={(e) => setLineName(e.target.value)} />
          </div>
          <div>
            <label htmlFor="line-color" className="mb-1 block font-medium select-none">Color</label>
            <input className="w-full rounded border border-neutral-300 px-2 py-1 text-xs" id="line-color" type="color" value={lineColor} onChange={(e) => setLineColor(e.target.value)} />
          </div>
        </div>
        <label className="flex cursor-pointer items-center gap-1.5 text-xs">
          <input type="checkbox" checked={lineIsCircular} onChange={(e) => setLineIsCircular(e.target.checked)} />
          Circular line
        </label>
        <Button variant="primary" onClick={handleAddLine}>Add Line</Button>
      </div>

      <div id="lines-list" className="mt-3 flex flex-col gap-2">
        {lines.map((line, index) => (
          <LineItem
            key={line.id}
            line={line}
            index={index}
            onRemove={handleRemoveLine}
            onEdit={setCurrentEditingLineId}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          />
        ))}
      </div>
    </div>
  );
};

export default LinesSection;
