import React, { useState } from 'react';
import { HVAlign, RoadSectionId } from '@/common/types';
import { RoadData } from '@/common/messages';
import { postMessageToPlugin } from '../figma';

interface Props {
  roads: RoadData[];
}

const StationsSection: React.FC<Props> = ({ roads }) => {
  const [stationName, setStationName] = useState('');
  const [textAlign, setTextAlign] = useState<HVAlign>('right');
  const [roadSectionId, setRoadSectionId] = useState<RoadSectionId | ''>('');
  const [interpT, setInterpT] = useState(0.5);

  const allSections = roads.flatMap(road =>
    road.sections.map(s => {
      const sectionName = s.name ?? `Section ${s.index}`;
      return {
        id: s.id,
        label: `${road.name ?? road.id} / ${sectionName}`
      }
    })
  );

  const handleAddStation = () => {
    postMessageToPlugin({
      type: 'add-station',
      station: {
        name: stationName,
        textAlign,
        roadSectionId: roadSectionId || undefined,
        interpT: roadSectionId ? interpT : undefined
      }
    });
    setStationName('');
  };

  return (
    <div className="section">
      <h3>Stations</h3>
      <div className="grid">
        <div className="two-column">
          <div>
            <label htmlFor="station-name">Station Name</label>
            <textarea
              className="input"
              id="station-name"
              placeholder="Station A"
              value={stationName}
              onChange={(e) => setStationName(e.target.value)}
              rows={2}
            />
          </div>
          <div>
            <label htmlFor="station-text-align">Text Side</label>
            <select
              className="input"
              id="station-text-align"
              value={textAlign}
              onChange={(e) => setTextAlign(e.target.value as HVAlign)}
            >
              <option value="right">Right</option>
              <option value="left">Left</option>
              <option value="top">Top</option>
              <option value="bottom">Bottom</option>
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="station-road-section">Road Section</label>
          {allSections.length === 0 ? (
            <p style={{ color: '#999', fontSize: '11px', margin: '4px 0' }}>
              No road sections — add them in the Network tab.
            </p>
          ) : (
            <select
              className="input"
              id="station-road-section"
              value={roadSectionId}
              onChange={(e) => setRoadSectionId(e.target.value as RoadSectionId | '')}
            >
              <option value="">(unlinked)</option>
              {allSections.map(s => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          )}
        </div>

        {roadSectionId && (
          <div>
            <label htmlFor="station-interp-t">
              Position on road: {interpT.toFixed(2)}
            </label>
            <input
              id="station-interp-t"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={interpT}
              onChange={(e) => setInterpT(Number.parseFloat(e.target.value))}
              style={{ width: '100%' }}
            />
          </div>
        )}

        <button className="button button--primary" onClick={handleAddStation}>
          Add Station
        </button>
      </div>
    </div>
  );
};

export default StationsSection;
