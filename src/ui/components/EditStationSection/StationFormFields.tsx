import React, { useEffect, useRef, useState } from 'react';
import { HVAlign, StationId, TextHAlign } from '@/common/types';
import { postMessageToPlugin } from '../../figma';

interface Props {
  stationId: StationId;
  stationName: string;
  stationTextAlign: HVAlign;
  stationTextHAlign: TextHAlign;
  stationTextRotation: number;
  stationFlipped: boolean;
  isCombiningMode: boolean;
  setIsCombiningMode: (v: boolean) => void;
  onClose: () => void;
}

const StationFormFields: React.FC<Props> = ({
  stationId, stationName,
  stationTextAlign, stationTextHAlign, stationTextRotation, stationFlipped,
  isCombiningMode, setIsCombiningMode,
  onClose,
}) => {
  const [name, setName]               = useState(stationName);
  const [textAlign, setTextAlign]     = useState(stationTextAlign);
  const [textHAlign, setTextHAlign]   = useState(stationTextHAlign);
  const [textRotation, setTextRotation] = useState(stationTextRotation);
  const [flipped, setFlipped]         = useState(stationFlipped);

  const nameUpdateTimerRef = useRef<number | null>(null);

  const onUpdateStation = (name: string, textAlign: HVAlign, textHAlign: TextHAlign, textRotation: number, flipped: boolean) => {
    postMessageToPlugin({ type: 'patch-station', stationId, patch: { op: 'update', station: { name, textAlign, textHAlign, textRotation, flipped } } });
  };

  // Sync local state when server state changes (different station selected while panel is open)
  useEffect(() => {
    setName(stationName);
    setTextAlign(stationTextAlign);
    setTextHAlign(stationTextHAlign);
    setTextRotation(stationTextRotation);
    setFlipped(stationFlipped);
  }, [stationName, stationTextAlign, stationTextHAlign, stationTextRotation, stationFlipped]);

  useEffect(() => {
    if (nameUpdateTimerRef.current) clearTimeout(nameUpdateTimerRef.current);
    if (name !== stationName) {
      nameUpdateTimerRef.current = setTimeout(() => { onUpdateStation(name, textAlign, textHAlign, textRotation, flipped); }, 500);
    }
    return () => { if (nameUpdateTimerRef.current) clearTimeout(nameUpdateTimerRef.current); };
  }, [name]);

  useEffect(() => {
    if (textAlign !== stationTextAlign) onUpdateStation(name, textAlign, textHAlign, textRotation, flipped);
  }, [textAlign]);

  useEffect(() => {
    if (textHAlign !== stationTextHAlign) onUpdateStation(name, textAlign, textHAlign, textRotation, flipped);
  }, [textHAlign]);

  useEffect(() => {
    if (textRotation !== stationTextRotation) onUpdateStation(name, textAlign, textHAlign, textRotation, flipped);
  }, [textRotation]);

  useEffect(() => {
    if (flipped !== stationFlipped) onUpdateStation(name, textAlign, textHAlign, textRotation, flipped);
  }, [flipped]);

  return (
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
      <div style={{ marginBottom: '8px' }}>
        <label htmlFor="edit-station-text-halign">Text Alignment</label>
        <select
          className="input"
          id="edit-station-text-halign"
          value={textHAlign}
          onChange={(e) => setTextHAlign(e.target.value as TextHAlign)}
        >
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
        </select>
      </div>
      <div style={{ marginBottom: '8px' }}>
        <label htmlFor="edit-station-text-rotation">Text Rotation (°)</label>
        <input
          className="input"
          id="edit-station-text-rotation"
          type="number"
          value={textRotation}
          onChange={(e) => setTextRotation(Number(e.target.value))}
        />
      </div>
      <div style={{ marginBottom: '8px' }}>
        <button
          className={`button full-width${flipped ? '' : ' button--secondary'}`}
          onClick={() => setFlipped(f => !f)}
        >
          {flipped ? 'Flipped (180°)' : 'Flip 180°'}
        </button>
      </div>
      <div className="two-column" style={{ marginBottom: '8px' }}>
        <button className="button button--secondary" onClick={() => postMessageToPlugin({ type: 'patch-station', stationId, patch: { op: 'copy', direction: 'forwards' } })}>
          Copy Forwards
        </button>
        <button className="button button--secondary" onClick={() => postMessageToPlugin({ type: 'patch-station', stationId, patch: { op: 'copy', direction: 'backwards' } })}>
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
          const displayName = stationName || '(unnamed station)';
          if (confirm(`Are you sure you want to delete "${displayName}"? This action cannot be undone.`)) {
            postMessageToPlugin({ type: 'patch-station', stationId, patch: { op: 'delete' } });
            onClose();
          }
        }}
        style={{ color: '#F24822' }}
      >
        Delete Station
      </button>
    </div>
  );
};

export default StationFormFields;
