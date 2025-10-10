import React from 'react';
import { LineAtStationData } from '../../common/messages';
import { LineId } from '../../common/types';

interface Props {
  stationId: string | null;
  stationName: string | null;
  linesAtStation: LineAtStationData[];
  onToggleStopsAt: (lineId: LineId, stopsAt: boolean) => void;
  onRemoveLine: (lineId: LineId) => void;
  onClose: () => void;
}

const EditStationSection: React.FC<Props> = ({
  stationId,
  stationName,
  linesAtStation,
  onToggleStopsAt,
  onRemoveLine,
  onClose
}) => {
  if (!stationId || !stationName) {
    return (
      <div className="section">
        <h3>Edit Station</h3>
        <p style={{ color: '#666', fontSize: '11px', padding: '8px' }}>
          Click on a station in the canvas to edit it
        </p>
      </div>
    );
  }

  return (
    <div className="section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>Station: {stationName}</h3>
        <button className="button button--secondary" onClick={onClose} style={{ padding: '4px 8px', fontSize: '11px' }}>
          Close
        </button>
      </div>

      {linesAtStation.length === 0 ? (
        <p style={{ color: '#666', fontSize: '11px', padding: '8px' }}>
          No lines pass through this station
        </p>
      ) : (
        <div>
          <label>Lines at this station (☑ = stops, ☐ = passes by)</label>
          <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
            {linesAtStation.map((lineInfo) => (
              <div key={lineInfo.id} className="station-path-item" style={{ alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                  <div
                    style={{
                      width: '12px',
                      height: '12px',
                      backgroundColor: lineInfo.color,
                      borderRadius: '2px',
                      border: '1px solid rgba(0,0,0,0.1)'
                    }}
                  />
                  <input
                    type="checkbox"
                    checked={lineInfo.stopsAt}
                    onChange={() => onToggleStopsAt(lineInfo.id, lineInfo.stopsAt)}
                    title={lineInfo.stopsAt ? "Line stops at this station" : "Line passes by this station"}
                  />
                  <span style={{ opacity: lineInfo.stopsAt ? 1 : 0.6 }}>
                    {lineInfo.name}
                  </span>
                </div>
                <button
                  className="button button--secondary small-btn"
                  onClick={() => onRemoveLine(lineInfo.id)}
                  title="Remove line from this station"
                >
                  X
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default EditStationSection;
