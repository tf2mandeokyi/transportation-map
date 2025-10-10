import React, { useState } from 'react';
import { LineId, StationId } from '../../common/types';
import { postMessageToPlugin } from '../figma';
import { LineData } from '../../common/messages';
import { FigmaPluginMessageManager } from '../events';

interface Props {
  lines: LineData[];
  messageManagerRef: React.RefObject<FigmaPluginMessageManager>;
}

const EditLinePathSection: React.FC<Props> = ({
  lines,
  messageManagerRef
}) => {
  const [currentEditingLineId, setCurrentEditingLineId] = useState<LineId | null>(null);
  const [linePathData, setLinePathData] = useState<{ lineId: LineId; stationIds: StationId[]; stationNames: string[]; stopsAt: boolean[] } | null>(null);

  messageManagerRef.current.onMessage('station-removed-from-line', () => {
    setCurrentEditingLineId(current => {
      if (current) {
        postMessageToPlugin({
          type: 'get-line-path',
          lineId: current
        });
      }
      return current;
    });
  });

  messageManagerRef.current.onMessage('line-path-data', msg => {
    setLinePathData(msg);
  });

  const handleLineChange = (lineId: LineId) => {
    if (lineId) {
      setCurrentEditingLineId(lineId);
      postMessageToPlugin({
        type: 'get-line-path',
        lineId
      });
    } else {
      setCurrentEditingLineId(null);
    }
  };

  const handleRemoveStation = (lineId: LineId, stationId: StationId) => {
    postMessageToPlugin({
      type: 'remove-station-from-line',
      lineId,
      stationId
    });
  };

  const handleToggleStopsAt = (lineId: LineId, stationId: StationId, currentStopsAt: boolean) => {
    postMessageToPlugin({
      type: 'set-line-stops-at-station',
      lineId,
      stationId,
      stopsAt: !currentStopsAt
    });
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
            value={currentEditingLineId ?? ''}
            onChange={(e) => handleLineChange(e.target.value as LineId)}
          >
            <option value="">Choose a line...</option>
            {lines.map(line => (
              <option key={line.id} value={line.id}>{line.name}</option>
            ))}
          </select>
        </div>
        {showPath && (
          <div>
            <label>Current Path (☑ = stops, ☐ = passes by)</label>
            <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
              {linePathData.stationIds.length === 0 ? (
                <p style={{ color: '#666', fontSize: '11px', padding: '8px' }}>
                  No stations in path
                </p>
              ) : (
                linePathData.stationIds.map((stationId, index) => {
                  const stopsAt = linePathData.stopsAt[index];
                  return (
                    <div key={stationId} className="station-path-item">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="station-number">{index + 1}</span>
                        <input
                          type="checkbox"
                          checked={stopsAt}
                          onChange={() => handleToggleStopsAt(linePathData.lineId, stationId, stopsAt)}
                          title={stopsAt ? "Line stops at this station" : "Line passes by this station"}
                        />
                        <span style={{ opacity: stopsAt ? 1 : 0.6 }}>
                          {linePathData.stationNames[index]}
                        </span>
                      </div>
                      <button
                        className="button button--secondary small-btn"
                        onClick={() => handleRemoveStation(linePathData.lineId, stationId)}
                      >
                        X
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EditLinePathSection;
