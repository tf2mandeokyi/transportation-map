import React, { useCallback, useEffect, useRef, useState } from 'react';
import { LineAtStationData } from '@/common/messages';
import { HVAlign, StationId, TextHAlign } from '@/common/types';
import { postMessageToPlugin } from '../../figma';
import { useMessageManager } from '../../contexts/MessageContext';
import StationFormFields from './StationFormFields';
import StationLineList from './StationLineList';

const EditStationSection: React.FC = () => {
  const manager = useMessageManager();

  const [stationId, setStationId]                     = useState<StationId | null>(null);
  const [stationName, setStationName]                 = useState<string | null>(null);
  const [stationTextAlign, setStationTextAlign]       = useState<HVAlign | null>(null);
  const [stationTextHAlign, setStationTextHAlign]     = useState<TextHAlign | null>(null);
  const [stationTextRotation, setStationTextRotation] = useState<number | null>(null);
  const [stationFlipped, setStationFlipped]           = useState<boolean | null>(null);
  const [linesAtStation, setLinesAtStation]           = useState<Array<LineAtStationData>>([]);
  const [isCombiningMode, setIsCombiningMode]         = useState(false);

  // Refs to avoid stale closures in the message subscription
  const isCombiningModeRef = useRef(isCombiningMode);
  const stationIdRef       = useRef(stationId);
  useEffect(() => { isCombiningModeRef.current = isCombiningMode; }, [isCombiningMode]);
  useEffect(() => { stationIdRef.current = stationId; }, [stationId]);

  const onClose = useCallback(() => {
    setStationId(null);
    setStationName(null);
    setStationTextAlign(null);
    setStationTextHAlign(null);
    setStationTextRotation(null);
    setStationFlipped(null);
    setLinesAtStation([]);
    setIsCombiningMode(false);
  }, []);

  useEffect(() => {
    const unsubscribe = manager.onMessage('station-clicked', msg => {
      if (isCombiningModeRef.current && stationIdRef.current && msg.stationId !== stationIdRef.current) {
        postMessageToPlugin({ type: 'patch-station', stationId: stationIdRef.current, patch: { op: 'combine', targetStationId: msg.stationId } });
        onClose();
      } else {
        setStationId(msg.stationId);
        setStationName(msg.station.name);
        setStationTextAlign(msg.station.textAlign);
        setStationTextHAlign(msg.station.textHAlign);
        setStationTextRotation(msg.station.textRotation);
        setStationFlipped(msg.station.flipped);
        setLinesAtStation(msg.lines);
        setIsCombiningMode(false);
      }
    });
    return unsubscribe;
  }, [manager, onClose]);

  if (!stationId || stationName === null || stationTextAlign === null || stationTextHAlign === null || stationTextRotation === null || stationFlipped === null) {
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
      <StationFormFields
        stationId={stationId}
        stationName={stationName}
        stationTextAlign={stationTextAlign}
        stationTextHAlign={stationTextHAlign}
        stationTextRotation={stationTextRotation}
        stationFlipped={stationFlipped}
        isCombiningMode={isCombiningMode}
        setIsCombiningMode={setIsCombiningMode}
        onClose={onClose}
      />
      <StationLineList
        stationId={stationId}
        lines={linesAtStation}
      />
    </div>
  );
};

export default EditStationSection;
