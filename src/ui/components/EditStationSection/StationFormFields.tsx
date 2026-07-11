import React, { useEffect, useState } from 'react';
import { HVAlign, StationId, TextHAlign, TextVAlign } from '@/common/types';
import { postMessageToPlugin } from '../../figma';
import Button from '../common/Button';
import ConfirmButton from '../common/ConfirmButton';

interface Props {
  stationId: StationId;
  stationName: string;
  stationTextAlign: HVAlign;
  stationTextHAlign: TextHAlign;
  stationTextVAlign: TextVAlign;
  stationTextRotation: number;
  stationFlipped: boolean;
  isCombiningMode: boolean;
  setIsCombiningMode: (v: boolean) => void;
  onClose: () => void;
  // Reported on every dirty/clean transition so the surrounding Edit Station panel's
  // Close/switch-station guard also catches unapplied field edits.
  onDirtyChange: (dirty: boolean) => void;
}

const StationFormFields: React.FC<Props> = ({
  stationId, stationName,
  stationTextAlign, stationTextHAlign, stationTextVAlign, stationTextRotation, stationFlipped,
  isCombiningMode, setIsCombiningMode,
  onClose, onDirtyChange,
}) => {
  const [name, setName]               = useState(stationName);
  const [textAlign, setTextAlign]     = useState(stationTextAlign);
  const [textHAlign, setTextHAlign]   = useState(stationTextHAlign);
  const [textVAlign, setTextVAlign]   = useState(stationTextVAlign);
  const [textRotation, setTextRotation] = useState(stationTextRotation);
  const [flipped, setFlipped]         = useState(stationFlipped);

  const isDirty = name !== stationName || textAlign !== stationTextAlign || textHAlign !== stationTextHAlign
    || textVAlign !== stationTextVAlign || textRotation !== stationTextRotation || flipped !== stationFlipped;

  useEffect(() => { onDirtyChange(isDirty); }, [isDirty, onDirtyChange]);

  // Sync local state when server state changes — either a different station was
  // selected, or our own Apply just echoed back as the new prop values (a no-op
  // reset in that case, since local already matches).
  useEffect(() => {
    setName(stationName);
    setTextAlign(stationTextAlign);
    setTextHAlign(stationTextHAlign);
    setTextVAlign(stationTextVAlign);
    setTextRotation(stationTextRotation);
    setFlipped(stationFlipped);
  }, [stationName, stationTextAlign, stationTextHAlign, stationTextVAlign, stationTextRotation, stationFlipped]);

  const handleApply = () => {
    postMessageToPlugin({ type: 'patch-station', stationId, patch: { op: 'update', station: { name, textAlign, textHAlign, textVAlign, textRotation, flipped } } });
  };

  const handleCancelEdits = () => {
    setName(stationName);
    setTextAlign(stationTextAlign);
    setTextHAlign(stationTextHAlign);
    setTextVAlign(stationTextVAlign);
    setTextRotation(stationTextRotation);
    setFlipped(stationFlipped);
  };

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
      <div className="mb-2 grid grid-cols-2 gap-2">
        <div>
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
        <div>
          <label htmlFor="edit-station-text-valign" className="mb-1 block font-medium select-none">Text Anchor</label>
          <select
            className="w-full rounded border border-neutral-300 px-2 py-1 text-xs"
            id="edit-station-text-valign"
            value={textVAlign}
            onChange={(e) => setTextVAlign(e.target.value as TextVAlign)}
          >
            <option value="top">Top</option>
            <option value="center">Middle</option>
            <option value="bottom">Bottom</option>
          </select>
        </div>
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
        <Button variant="primary" disabled={!isDirty} onClick={handleApply}>
          Apply
        </Button>
        <ConfirmButton
          label="Cancel"
          onConfirm={handleCancelEdits}
          skipConfirm={!isDirty}
          prompt="Discard unsaved changes?"
          confirmLabel="Discard"
          keepLabel="Keep editing"
        />
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
      <ConfirmButton
        fullWidth
        variant="danger"
        label="Delete Station"
        prompt={`Delete "${stationName || '(unnamed station)'}"?`}
        confirmLabel="Delete"
        keepLabel="Never mind"
        onConfirm={() => {
          postMessageToPlugin({ type: 'patch-station', stationId, patch: { op: 'delete' } });
          onClose();
        }}
      />
    </div>
  );
};

export default StationFormFields;
