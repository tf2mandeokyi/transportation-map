import React, { useState, useEffect } from 'react';
import { LineAtStationData } from '../../common/messages';
import { LineId, StationId, StationOrientation } from '../../common/types';
import { postMessageToPlugin } from '../figma';
import { FigmaPluginMessageManager } from '../events';

interface Props {
  messageManagerRef: React.RefObject<FigmaPluginMessageManager>;
}

const EditStationSection: React.FC<Props> = ({ messageManagerRef }) => {
  const [stationId, setStationId] = useState<StationId | null>(null);
  const [stationName, setStationName] = useState<string | null>(null);
  const [stationOrientation, setStationOrientation] = useState<StationOrientation | null>(null);
  const [stationHidden, setStationHidden] = useState<boolean | null>(null);
  const [linesAtStation, setLinesAtStation] = useState<Array<LineAtStationData>>([]);

  const [name, setName] = useState('');
  const [orientation, setOrientation] = useState<StationOrientation>('RIGHT');
  const [hidden, setHidden] = useState(false);

  // Set up message listeners once on mount
  useEffect(() => {
    const unsubscribe1 = messageManagerRef.current.onMessage('station-clicked', msg => {
      setStationId(msg.stationId);
      setStationName(msg.stationName);
      setStationOrientation(msg.orientation);
      setStationHidden(msg.hidden);
      setLinesAtStation(msg.lines);
    });

    const unsubscribe2 = messageManagerRef.current.onMessage('toggle-stops-at', msg => {
      setLinesAtStation(prev => prev.map(line =>
        line.id === msg.lineId ? { ...line, stopsAt: msg.stopsAt } : line
      ));
    });

    // Cleanup
    return () => {
      unsubscribe1();
      unsubscribe2();
    };
  }, []);

  const onClose = () => {
    setStationId(null);
    setStationName(null);
    setStationOrientation(null);
    setStationHidden(null);
    setLinesAtStation([]);
  };
  
  const onToggleStopsAt = (lineId: LineId, currentStopsAt: boolean) => {
    if (!stationId) return;

    postMessageToPlugin({
      type: 'set-line-stops-at-station',
      lineId,
      stationId,
      stopsAt: !currentStopsAt
    });
  };

  const onRemoveLine = (lineId: LineId) => {
    if (!stationId) return;

    postMessageToPlugin({
      type: 'remove-line-from-station',
      stationId,
      lineId: lineId
    });
  };

  const onUpdateStation = (name: string, orientation: StationOrientation, hidden: boolean) => {
    if (!stationId) return;

    postMessageToPlugin({
      type: 'update-station',
      stationId,
      name,
      orientation,
      hidden
    });
  };

  const onDeleteStation = () => {
    if (!stationId) return;

    if (confirm(`Are you sure you want to delete "${stationName}"? This action cannot be undone.`)) {
      postMessageToPlugin({
        type: 'delete-station',
        stationId
      });
      onClose();
    }
  };

  // Update local state when station data changes
  useEffect(() => {
    if (stationName) setName(stationName);
    if (stationOrientation) setOrientation(stationOrientation);
    if (stationHidden !== null) setHidden(stationHidden);
  }, [stationName, stationOrientation, stationHidden]);

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

  const handleUpdate = () => {
    onUpdateStation(name, orientation, hidden);
  };

  return (
    <div className="section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>Edit Station</h3>
        <button className="button button--secondary" onClick={onClose} style={{ padding: '4px 8px', fontSize: '11px' }}>
          Close
        </button>
      </div>

      {/* Station Properties */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ marginBottom: '8px' }}>
          <label htmlFor="edit-station-name">Station Name</label>
          <input
            className="input"
            id="edit-station-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div style={{ marginBottom: '8px' }}>
          <label htmlFor="edit-station-orientation">Facing</label>
          <select
            className="input"
            id="edit-station-orientation"
            value={orientation}
            onChange={(e) => setOrientation(e.target.value as StationOrientation)}
          >
            <option value="RIGHT">Right</option>
            <option value="LEFT">Left</option>
            <option value="UP">Up</option>
            <option value="DOWN">Down</option>
          </select>
        </div>
        <div className="checkbox-container" style={{ marginBottom: '8px' }}>
          <input
            type="checkbox"
            id="edit-station-hidden"
            checked={hidden}
            onChange={(e) => setHidden(e.target.checked)}
          />
          <label htmlFor="edit-station-hidden">Hidden (shaping point)</label>
        </div>
        <div className="two-column">
          <button className="button button--primary" onClick={handleUpdate}>
            Update Station
          </button>
          <button className="button button--secondary" onClick={onDeleteStation} style={{ color: '#F24822' }}>
            Delete Station
          </button>
        </div>
      </div>

      {/* Lines Section */}
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
