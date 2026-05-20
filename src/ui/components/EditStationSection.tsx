import React, { useEffect, useRef, useState } from 'react';
import { LineAtStationData } from '@/common/messages';
import { HVAlign, StationId } from '@/common/types';
import { postMessageToPlugin } from '../figma';
import { useMessageManager } from '../contexts/MessageContext';

const EditStationSection: React.FC = () => {
  const manager = useMessageManager();

  const [stationId, setStationId]           = useState<StationId | null>(null);
  const [stationName, setStationName]       = useState<string | null>(null);
  const [stationTextAlign, setStationTextAlign] = useState<HVAlign | null>(null);
  const [linesAtStation, setLinesAtStation] = useState<Array<LineAtStationData>>([]);

  const [name, setName]             = useState('');
  const [textAlign, setTextAlign]   = useState<HVAlign>('right');
  const [isCombiningMode, setIsCombiningMode] = useState(false);

  // Refs to avoid stale closures in the message subscription
  const isCombiningModeRef = useRef(isCombiningMode);
  const stationIdRef       = useRef(stationId);
  useEffect(() => { isCombiningModeRef.current = isCombiningMode; }, [isCombiningMode]);
  useEffect(() => { stationIdRef.current = stationId; }, [stationId]);

  const nameUpdateTimerRef = useRef<number | null>(null);

  const onClose = () => {
    setStationId(null);
    setStationName(null);
    setStationTextAlign(null);
    setLinesAtStation([]);
    setIsCombiningMode(false);
  };

  useEffect(() => {
    const unsubscribe = manager.onMessage('station-clicked', msg => {
      if (isCombiningModeRef.current && stationIdRef.current && msg.stationId !== stationIdRef.current) {
        postMessageToPlugin({
          type: 'combine-stations',
          sourceStationId: stationIdRef.current,
          targetStationId: msg.stationId,
        });
        onClose();
      } else {
        setStationId(msg.stationId);
        setStationName(msg.stationName);
        setStationTextAlign(msg.textAlign);
        setLinesAtStation(msg.lines);
        setIsCombiningMode(false);
      }
    });

    return () => {
      unsubscribe();
      if (nameUpdateTimerRef.current) clearTimeout(nameUpdateTimerRef.current);
    };
  }, [manager]);

  const onUpdateStation = (name: string, textAlign: HVAlign) => {
    if (!stationId) return;
    postMessageToPlugin({ type: 'update-station', stationId, name, textAlign });
  };

  useEffect(() => {
    if (stationName !== null) setName(stationName);
    if (stationTextAlign) setTextAlign(stationTextAlign);
  }, [stationName, stationTextAlign]);

  useEffect(() => {
    if (!stationId || stationName === null) return;
    if (nameUpdateTimerRef.current) clearTimeout(nameUpdateTimerRef.current);
    if (name !== stationName) {
      nameUpdateTimerRef.current = setTimeout(() => { onUpdateStation(name, textAlign); }, 500);
    }
    return () => { if (nameUpdateTimerRef.current) clearTimeout(nameUpdateTimerRef.current); };
  }, [name]);

  useEffect(() => {
    if (!stationId || stationTextAlign === null) return;
    if (textAlign !== stationTextAlign) onUpdateStation(name, textAlign);
  }, [textAlign]);

  if (!stationId || stationName === null) {
    return (
      <div className="section">
        <h3>Edit Station</h3>
        <p style={{ color: '#666', fontSize: '11px', padding: '8px' }}>Click on a station in the canvas to edit it</p>
      </div>
    );
  }

  return (
    <div className="section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>Edit Station</h3>
        <button className="button button--secondary" onClick={onClose} style={{ padding: '4px 8px', fontSize: '11px' }}>Close</button>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <div style={{ marginBottom: '8px' }}>
          <label htmlFor="edit-station-name">Station Name</label>
          <textarea
            className="input"
            id="edit-station-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="(Leave empty for crossroad/shaping point)"
            rows={2}
          />
        </div>
        <div style={{ marginBottom: '8px' }}>
          <label htmlFor="edit-station-text-align">Text Side</label>
          <select
            className="input"
            id="edit-station-text-align"
            value={textAlign}
            onChange={(e) => setTextAlign(e.target.value as HVAlign)}
          >
            <option value="right">Right</option>
            <option value="left">Left</option>
            <option value="top">Top</option>
            <option value="bottom">Bottom</option>
          </select>
        </div>
        <div className="two-column" style={{ marginBottom: '8px' }}>
          <button className="button button--secondary" onClick={() => postMessageToPlugin({ type: 'copy-station', stationId, direction: 'forwards' })}>
            Copy Forwards
          </button>
          <button className="button button--secondary" onClick={() => postMessageToPlugin({ type: 'copy-station', stationId, direction: 'backwards' })}>
            Copy Backwards
          </button>
        </div>
        {isCombiningMode ? (
          <div style={{ padding: '12px', background: '#fff3cd', borderRadius: '4px', marginBottom: '8px', border: '1px solid #ffc107' }}>
            <p style={{ fontSize: '11px', color: '#856404', margin: '0 0 8px 0', fontWeight: 'bold' }}>Combining mode active</p>
            <p style={{ fontSize: '11px', color: '#856404', margin: '0 0 8px 0' }}>
              Click another station on the canvas to combine this station with it. All line stops will be transferred.
            </p>
            <button className="button button--secondary full-width" onClick={() => setIsCombiningMode(false)}>Cancel</button>
          </div>
        ) : (
          <button className="button button--secondary full-width" onClick={() => setIsCombiningMode(true)} style={{ marginBottom: '8px' }}>
            Combine with Another Station
          </button>
        )}
        <button
          className="button button--secondary full-width"
          onClick={() => {
            if (!stationId) return;
            const displayName = stationName || '(unnamed station)';
            if (confirm(`Are you sure you want to delete "${displayName}"? This action cannot be undone.`)) {
              postMessageToPlugin({ type: 'delete-station', stationId });
              onClose();
            }
          }}
          style={{ color: '#F24822' }}
        >
          Delete Station
        </button>
      </div>

      {linesAtStation.length > 0 && (
        <div>
          <label>Lines at this station</label>
          <div style={{ maxHeight: '200px', overflowY: 'auto', marginTop: '8px' }}>
            {linesAtStation.map((lineInfo) => (
              <div key={lineInfo.id} className="station-path-item" style={{ alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                  <div style={{ width: '12px', height: '12px', backgroundColor: lineInfo.color, borderRadius: '2px', border: '1px solid rgba(0,0,0,0.1)' }} />
                  <span>{lineInfo.name}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default EditStationSection;
