import React, { useEffect, useRef, useState } from 'react';
import { HVAlign, StationId, TextHAlign } from '@/common/types';
import { postMessageToPlugin } from '../../figma';
import Button from '../common/Button';

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

  const nameUpdateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    <div className="mb-4">
      <div className="mb-2">
        <label htmlFor="edit-station-name" className="mb-1 block font-medium select-none">Station Name</label>
        <textarea
          className="w-full rounded border border-neutral-300 px-2 py-1 text-xs"
          id="edit-station-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="(Leave empty for crossroad/shaping point)"
          rows={2}
        />
      </div>
      <div className="mb-2">
        <label htmlFor="edit-station-text-align" className="mb-1 block font-medium select-none">Text Side</label>
        <select
          className="w-full rounded border border-neutral-300 px-2 py-1 text-xs"
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
      <div className="mb-2">
        <label htmlFor="edit-station-text-halign" className="mb-1 block font-medium select-none">Text Alignment</label>
        <select
          className="w-full rounded border border-neutral-300 px-2 py-1 text-xs"
          id="edit-station-text-halign"
          value={textHAlign}
          onChange={(e) => setTextHAlign(e.target.value as TextHAlign)}
        >
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
        </select>
      </div>
      <div className="mb-2">
        <label htmlFor="edit-station-text-rotation" className="mb-1 block font-medium select-none">Text Rotation (°)</label>
        <input
          className="w-full rounded border border-neutral-300 px-2 py-1 text-xs"
          id="edit-station-text-rotation"
          type="number"
          value={textRotation}
          onChange={(e) => setTextRotation(Number(e.target.value))}
        />
      </div>
      <div className="mb-2">
        <Button variant={flipped ? 'primary' : 'secondary'} fullWidth onClick={() => setFlipped(f => !f)}>
          {flipped ? 'Flipped (180°)' : 'Flip 180°'}
        </Button>
      </div>
      <div className="mb-2 grid grid-cols-2 gap-2">
        <Button onClick={() => postMessageToPlugin({ type: 'patch-station', stationId, patch: { op: 'copy', direction: 'forwards' } })}>
          Copy Forwards
        </Button>
        <Button onClick={() => postMessageToPlugin({ type: 'patch-station', stationId, patch: { op: 'copy', direction: 'backwards' } })}>
          Copy Backwards
        </Button>
      </div>
      {isCombiningMode ? (
        <div className="mb-2 rounded border border-amber-400 bg-amber-50 p-3">
          <p className="mb-2 text-[11px] font-bold text-amber-800">Combining mode active</p>
          <p className="mb-2 text-[11px] text-amber-800">
            Click another station on the canvas to combine this station with it. All line stops will be transferred.
          </p>
          <Button fullWidth onClick={() => setIsCombiningMode(false)}>Cancel</Button>
        </div>
      ) : (
        <Button fullWidth className="mb-2" onClick={() => setIsCombiningMode(true)}>
          Combine with Another Station
        </Button>
      )}
      <Button
        fullWidth
        className="text-[#F24822]"
        onClick={() => {
          const displayName = stationName || '(unnamed station)';
          if (confirm(`Are you sure you want to delete "${displayName}"? This action cannot be undone.`)) {
            postMessageToPlugin({ type: 'patch-station', stationId, patch: { op: 'delete' } });
            onClose();
          }
        }}
      >
        Delete Station
      </Button>
    </div>
  );
};

export default StationFormFields;
