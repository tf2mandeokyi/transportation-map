import React, { useCallback, useEffect, useRef, useState } from 'react';
import { LineAtStationData, StationParams } from '@/common/messages';
import { HVAlign, StationId, TextHAlign, TextVAlign } from '@/common/types';
import { postMessageToPlugin } from '../../figma';
import { useMessageManager } from '../../contexts/MessageContext';
import Button from '../common/Button';
import StationFormFields from './StationFormFields';
import StationLineList from './StationLineList';

type PendingStation = { stationId: StationId; station: StationParams; lines: LineAtStationData[] };

const EditStationSection: React.FC = () => {
  const manager = useMessageManager();

  const [stationId, setStationId]                     = useState<StationId | null>(null);
  const [stationName, setStationName]                 = useState<string | null>(null);
  const [stationTextAlign, setStationTextAlign]       = useState<HVAlign | null>(null);
  const [stationTextHAlign, setStationTextHAlign]     = useState<TextHAlign | null>(null);
  const [stationTextVAlign, setStationTextVAlign]     = useState<TextVAlign | null>(null);
  const [stationTextRotation, setStationTextRotation] = useState<number | null>(null);
  const [stationFlipped, setStationFlipped]           = useState<boolean | null>(null);
  const [linesAtStation, setLinesAtStation]           = useState<Array<LineAtStationData>>([]);
  const [isCombiningMode, setIsCombiningMode]         = useState(false);

  const [formDirty, setFormDirty]   = useState(false);
  const [linesDirty, setLinesDirty] = useState(false);
  const isDirty = formDirty || linesDirty;

  // A station-clicked (switch) or Close attempted while isDirty — held here until
  // the user confirms discarding, instead of applying immediately.
  const [pendingSwitch, setPendingSwitch] = useState<PendingStation | 'close' | null>(null);

  // Refs to avoid stale closures in the message subscription
  const isCombiningModeRef = useRef(isCombiningMode);
  const stationIdRef       = useRef(stationId);
  const isDirtyRef         = useRef(isDirty);
  useEffect(() => { isCombiningModeRef.current = isCombiningMode; }, [isCombiningMode]);
  useEffect(() => { stationIdRef.current = stationId; }, [stationId]);
  useEffect(() => { isDirtyRef.current = isDirty; }, [isDirty]);

  const applyStation = useCallback((data: PendingStation) => {
    setStationId(data.stationId);
    setStationName(data.station.name);
    setStationTextAlign(data.station.textAlign);
    setStationTextHAlign(data.station.textHAlign);
    setStationTextVAlign(data.station.textVAlign);
    setStationTextRotation(data.station.textRotation);
    setStationFlipped(data.station.flipped);
    setLinesAtStation(data.lines);
    setIsCombiningMode(false);
    setFormDirty(false);
    setLinesDirty(false);
  }, []);

  const onClose = useCallback(() => {
    setStationId(null);
    setStationName(null);
    setStationTextAlign(null);
    setStationTextHAlign(null);
    setStationTextVAlign(null);
    setStationTextRotation(null);
    setStationFlipped(null);
    setLinesAtStation([]);
    setIsCombiningMode(false);
    setFormDirty(false);
    setLinesDirty(false);
  }, []);

  const requestClose = useCallback(() => {
    if (isDirtyRef.current) setPendingSwitch('close');
    else onClose();
  }, [onClose]);

  const confirmPendingSwitch = () => {
    if (pendingSwitch === 'close') onClose();
    else if (pendingSwitch) applyStation(pendingSwitch);
    setPendingSwitch(null);
  };
  const cancelPendingSwitch = () => setPendingSwitch(null);

  useEffect(() => {
    const unsubscribe = manager.onMessage('station-clicked', msg => {
      if (isCombiningModeRef.current && stationIdRef.current && msg.stationId !== stationIdRef.current) {
        postMessageToPlugin({ type: 'patch-station', stationId: stationIdRef.current, patch: { op: 'combine', targetStationId: msg.stationId } });
        onClose();
        return;
      }
      const data: PendingStation = { stationId: msg.stationId, station: msg.station, lines: msg.lines };
      if (isDirtyRef.current && msg.stationId !== stationIdRef.current) {
        setPendingSwitch(data);
      } else {
        applyStation(data);
      }
    });
    return unsubscribe;
  }, [manager, onClose, applyStation]);

  if (!stationId || stationName === null || stationTextAlign === null || stationTextHAlign === null || stationTextVAlign === null || stationTextRotation === null || stationFlipped === null) {
    return (
      <div className="mb-4 border-b border-neutral-200 pb-4">
        <h3 className="mb-3 text-sm font-semibold">Edit Station</h3>
        <p className="p-2 text-[11px] text-neutral-500">Click on a station in the canvas to edit it</p>
      </div>
    );
  }

  return (
    <div className="mb-4 border-b border-neutral-200 pb-4">
      <div className="flex items-center justify-between">
        <h3 className="mb-3 text-sm font-semibold">Edit Station</h3>
        <Button size="sm" onClick={requestClose}>Close</Button>
      </div>
      {pendingSwitch && (
        <div className="mb-2 flex items-center gap-1.5 rounded border border-red-300 bg-red-50 px-2 py-1 text-[11px] text-red-700">
          <span className="flex-1">
            {pendingSwitch === 'close' ? 'Discard unsaved changes and close?' : 'Discard unsaved changes and switch stations?'}
          </span>
          <Button size="xs" variant="danger" onClick={confirmPendingSwitch}>Discard</Button>
          <Button size="xs" onClick={cancelPendingSwitch}>Stay here</Button>
        </div>
      )}
      <StationFormFields
        stationId={stationId}
        stationName={stationName}
        stationTextAlign={stationTextAlign}
        stationTextHAlign={stationTextHAlign}
        stationTextVAlign={stationTextVAlign}
        stationTextRotation={stationTextRotation}
        stationFlipped={stationFlipped}
        isCombiningMode={isCombiningMode}
        setIsCombiningMode={setIsCombiningMode}
        onClose={onClose}
        onDirtyChange={setFormDirty}
      />
      <StationLineList
        stationId={stationId}
        lines={linesAtStation}
        onDirtyChange={setLinesDirty}
      />
    </div>
  );
};

export default EditStationSection;
