import React from 'react';

export interface StationPathItemProps {
  name: string;
  index: number;
  stops: boolean;
  onRemove?: () => void;
  onSelect?: () => void;
  onToggleStops?: (stops: boolean) => void;
}

const StationPathItem: React.FC<StationPathItemProps> = ({ name, index, stops, onRemove, onSelect, onToggleStops }) => (
  <div className="station-path-item" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
    <span className="station-number" style={{ paddingLeft: '4px', paddingRight: '4px' }}>{index + 1}</span>
    {onToggleStops && (
      <input
        type="checkbox"
        checked={stops}
        onChange={e => onToggleStops(e.target.checked)}
        title={stops ? 'Stops here' : 'Passes through'}
      />
    )}
    <span
      style={{
        flex: 1,
        cursor: onSelect ? 'pointer' : 'default',
        color: stops ? 'inherit' : '#999',
        fontStyle: stops ? 'normal' : 'italic',
      }}
      onClick={onSelect}
    >
      {name}
    </span>
    {onRemove && stops && (
      <button className="button button--secondary small-btn" onClick={onRemove}>X</button>
    )}
  </div>
);

export default StationPathItem;
