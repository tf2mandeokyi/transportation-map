import React, { useState } from 'react';
import { LineId } from '@/common/types';
import { postMessageToPlugin } from '../figma';
import { LineData } from '@/common/messages';
import { useLinesContext } from '../contexts/LinesContext';

interface LineItemProps {
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

const LinesSection: React.FC = () => {
  const { lines, setCurrentEditingLineId, removeLine, reorderLines } = useLinesContext();
  const [lineName, setLineName]           = useState('');
  const [lineColor, setLineColor]         = useState('#ff0000');
  const [lineIsCircular, setLineIsCircular] = useState(false);
  const [lineCounter, setLineCounter]     = useState(0);
  const [draggedIndex, setDraggedIndex]   = useState<number | null>(null);

  const handleAddLine = () => {
    postMessageToPlugin({
      type: 'add-line',
      line: { name: lineName || `Line_${lineCounter}`, color: lineColor, isCircular: lineIsCircular }
    });
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
    <div className="section">
      <h3>Lines</h3>
      <div className="grid">
        <div className="two-column">
          <div>
            <label htmlFor="line-name">Line Name</label>
            <input className="input" id="line-name" type="text" placeholder="Line A" value={lineName} onChange={(e) => setLineName(e.target.value)} />
          </div>
          <div>
            <label htmlFor="line-color">Color</label>
            <input className="input" id="line-color" type="color" value={lineColor} onChange={(e) => setLineColor(e.target.value)} />
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
          <input type="checkbox" checked={lineIsCircular} onChange={(e) => setLineIsCircular(e.target.checked)} />
          Circular line
        </label>
        <button className="button button--primary" onClick={handleAddLine}>Add Line</button>
      </div>

      <div id="lines-list">
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
