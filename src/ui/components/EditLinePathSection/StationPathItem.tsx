import React from 'react';

export interface StationPathItemProps {
  name: string;
  index: number;
  onRemove: () => void;
  onSelect?: () => void;
}

const StationPathItem: React.FC<StationPathItemProps> = ({ name, index, onRemove, onSelect }) => (
  <div className="station-path-item" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
    <span className="station-number" style={{ paddingLeft: '4px', paddingRight: '4px' }}>{index + 1}</span>
    <span style={{ flex: 1, cursor: onSelect ? 'pointer' : 'default' }} onClick={onSelect}>{name}</span>
    <button className="button button--secondary small-btn" onClick={onRemove}>X</button>
  </div>
);

export default StationPathItem;
