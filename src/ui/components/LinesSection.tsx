import React, { useState } from 'react';
import { LineId } from '../../common/types';
import { postMessageToPlugin } from '../figma';
import { LineData } from '../../common/messages';

const LineItem: React.FC<{ line: LineData; onEdit: (lineId: LineId) => void; onRemove: (lineId: LineId) => void; }> = ({ line, onEdit, onRemove }) => {
  return (
    <div key={line.id} className="line-item">
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div className="line-color" style={{ backgroundColor: line.color }}></div>
        <span className="line-info">{line.name}</span>
      </div>
      <div className="line-controls">
        <button
          className="button button--secondary small-btn"
          onClick={() => onEdit(line.id)}
        >
          Edit
        </button>
        <button
          className="button button--secondary small-btn"
          onClick={() => onRemove(line.id)}
        >
          Remove
        </button>
      </div>
    </div>
  );
};

interface Props {
  lines: LineData[];
  onRemoveLine: (lineId: LineId) => void;
}

const LinesSection: React.FC<Props> = ({ lines, onRemoveLine }) => {
  const [lineName, setLineName] = useState('');
  const [lineColor, setLineColor] = useState('#ff0000');
  const [lineCounter, setLineCounter] = useState(0);

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

  const handleEditLine = (lineId: LineId) => {
    postMessageToPlugin({
      type: 'edit-line',
      lineId
    });
  };

  const handleRemoveLine = (lineId: LineId) => {
    postMessageToPlugin({
      type: 'remove-line',
      lineId
    });

    onRemoveLine(lineId);
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
        {lines.map(line => (
          <LineItem key={line.id} line={line} onEdit={handleEditLine} onRemove={handleRemoveLine} />
        ))}
      </div>
    </div>
  );
};

export default LinesSection;
