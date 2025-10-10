import React, { useState } from 'react';
import { LineId } from '../../common/types';
import { postMessageToPlugin } from '../figma';
import { LineData } from '../../common/messages';

interface LineItemProps {
  line: LineData;
  isSelected: boolean;
  onRemove: (lineId: LineId) => void;
  onEdit: (lineId: LineId) => void;
  onDragStart: (e: React.DragEvent, index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDrop: (e: React.DragEvent) => void;
  index: number;
}

const LineItem: React.FC<LineItemProps> = ({ line, isSelected, onRemove, onEdit, onDragStart, onDragOver, onDrop, index }) => {
  return (
    <div
      key={line.id}
      className="line-item"
      draggable
      onDragStart={(e) => onDragStart(e, index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDrop={onDrop}
      onClick={() => onEdit(line.id)}
      style={{
        cursor: 'grab',
        backgroundColor: isSelected ? '#e3f2fd' : 'transparent',
        border: isSelected ? '2px solid #18a0fb' : '2px solid transparent',
        transition: 'all 0.2s ease'
      }}
    >
      <div
        style={{ display: 'flex', alignItems: 'center', flex: 1, cursor: 'pointer' }}
        title="Click to edit line path"
      >
        <span style={{ marginRight: '8px', color: '#999', fontSize: '12px' }}>⋮⋮</span>
        <div className="line-color" style={{ backgroundColor: line.color }}></div>
        <span className="line-info">{line.name}</span>
      </div>
      <div className="line-controls">
        <button
          className="button button--secondary small-btn"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(line.id);
          }}
        >
          Remove
        </button>
      </div>
    </div>
  );
};

interface Props {
  lines: LineData[];
  currentEditingLineId: LineId | null;
  onRemoveLine: (lineId: LineId) => void;
  onEditLine: (lineId: LineId) => void;
  onReorderLines: (lines: LineData[]) => void;
}

const LinesSection: React.FC<Props> = ({ lines, currentEditingLineId, onRemoveLine, onEditLine, onReorderLines }) => {
  const [lineName, setLineName] = useState('');
  const [lineColor, setLineColor] = useState('#ff0000');
  const [lineCounter, setLineCounter] = useState(0);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const handleAddLine = () => {
    const lineData = {
      name: lineName || `Line_${lineCounter}`,
      color: lineColor
    };

    postMessageToPlugin({
      type: 'add-line',
      line: lineData
    });

    setLineName('');
    setLineCounter(prev => prev + 1);
  };

  const handleRemoveLine = (lineId: LineId) => {
    postMessageToPlugin({
      type: 'remove-line',
      lineId
    });

    onRemoveLine(lineId);
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    if (draggedIndex === null || draggedIndex === index) return;

    // Reorder the lines array
    const newLines = [...lines];
    const draggedLine = newLines[draggedIndex];
    newLines.splice(draggedIndex, 1);
    newLines.splice(index, 0, draggedLine);

    // Update the parent component's state
    onReorderLines(newLines);

    // Update the dragged index to the new position
    setDraggedIndex(index);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();

    if (draggedIndex === null) return;

    // Send the new order to the plugin
    const newOrder = lines.map(line => line.id);
    postMessageToPlugin({
      type: 'update-line-stacking-order',
      lineIds: newOrder
    });

    setDraggedIndex(null);
  };

  return (
    <div className="section">
      <h3>Lines</h3>
      <div className="grid">
        <div className="two-column">
          <div>
            <label htmlFor="line-name">Line Name</label>
            <input
              className="input"
              id="line-name"
              type="text"
              placeholder="Line A"
              value={lineName}
              onChange={(e) => setLineName(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="line-color">Color</label>
            <input
              className="input"
              id="line-color"
              type="color"
              value={lineColor}
              onChange={(e) => setLineColor(e.target.value)}
            />
          </div>
        </div>
        <button className="button button--primary" onClick={handleAddLine}>
          Add Line
        </button>
      </div>

      <div id="lines-list">
        {lines.map((line, index) => (
          <LineItem
            key={line.id}
            line={line}
            isSelected={line.id === currentEditingLineId}
            index={index}
            onRemove={handleRemoveLine}
            onEdit={onEditLine}
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
