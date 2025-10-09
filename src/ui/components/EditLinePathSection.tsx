import React from 'react';

interface LineData {
  id: string;
  name: string;
  color: string;
}

interface Props {
  lines: LineData[];
  currentEditingLineId: string | null;
  setCurrentEditingLineId: (value: string | null) => void;
  linePathData: { lineId: string; stationIds: string[]; stationNames: string[] } | null;
}

const EditLinePathSection: React.FC<Props> = ({
  lines,
  currentEditingLineId,
  setCurrentEditingLineId,
  linePathData
}) => {
  const handleLineChange = (lineId: string) => {
    if (lineId) {
      setCurrentEditingLineId(lineId);
      parent.postMessage({
        pluginMessage: {
          type: 'get-line-path',
          lineId
        }
      }, '*');
    } else {
      setCurrentEditingLineId(null);
    }
  };

  const handleRemoveStation = (lineId: string, stationId: string) => {
    parent.postMessage({
      pluginMessage: {
        type: 'remove-station-from-line',
        lineId,
        stationId
      }
    }, '*');
  };

  const showPath = currentEditingLineId && linePathData && linePathData.lineId === currentEditingLineId;

  return (
    <div className="section">
      <h3>Edit Line Path</h3>
      <div className="grid">
        <div>
          <label htmlFor="edit-line-select">Select Line to Edit</label>
          <select
            className="input"
            id="edit-line-select"
            value={currentEditingLineId || ''}
            onChange={(e) => handleLineChange(e.target.value)}
          >
            <option value="">Choose a line...</option>
            {lines.map(line => (
              <option key={line.id} value={line.id}>{line.name}</option>
            ))}
          </select>
        </div>
        {showPath && (
          <div>
            <label>Current Path (click X to remove)</label>
            <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
              {linePathData.stationIds.length === 0 ? (
                <p style={{ color: '#666', fontSize: '11px', padding: '8px' }}>
                  No stations in path
                </p>
              ) : (
                linePathData.stationIds.map((stationId, index) => (
                  <div key={stationId} className="station-path-item">
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <span className="station-number">{index + 1}</span>
                      <span>{linePathData.stationNames[index]}</span>
                    </div>
                    <button
                      className="button button--secondary small-btn"
                      onClick={() => handleRemoveStation(linePathData.lineId, stationId)}
                    >
                      X
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EditLinePathSection;
