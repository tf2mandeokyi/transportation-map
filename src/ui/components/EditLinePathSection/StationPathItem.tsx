import React from 'react';
import Button from '../common/Button';

export interface StationPathItemProps {
  name: string;
  index: number;
  stops: boolean;
  direction?: 'ascending' | 'descending';
  onRemove?: () => void;
  onSelect?: () => void;
  onToggleStops?: (stops: boolean) => void;
  onToggleDirection?: () => void;
}

const StationPathItem: React.FC<StationPathItemProps> = ({
  name, index, stops, direction, onRemove, onSelect, onToggleStops, onToggleDirection,
}) => (
  <div className="flex items-center gap-2 rounded border border-neutral-200 bg-white px-2 hover:bg-neutral-100">
    <span className="mr-2 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#18a0fb] px-1 text-[10px] font-bold text-white">{index + 1}</span>
    {onToggleStops && (
      <input
        type="checkbox"
        checked={stops}
        onChange={e => onToggleStops(e.target.checked)}
        title={stops ? 'Stops here' : 'Passes through'}
      />
    )}
    <span
      className={`flex-1 ${onSelect ? 'cursor-pointer' : 'cursor-default'} ${stops ? '' : 'italic text-neutral-400'}`}
      onClick={onSelect}
    >
      {name}
    </span>
    {onToggleDirection && direction && (
      <Button
        size="xs"
        onClick={onToggleDirection}
        title={`Direction: ${direction} (click to flip — only takes effect where direction can't be inferred automatically)`}
      >
        {direction === 'ascending' ? '↑' : '↓'}
      </Button>
    )}
    {onRemove && stops && (
      <Button size="sm" onClick={onRemove}>X</Button>
    )}
  </div>
);

export default StationPathItem;
