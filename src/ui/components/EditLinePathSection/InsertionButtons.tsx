import React from 'react';

const InsertionButtons: React.FC<{
  onAddStation?: () => void;
  onAddRse?: () => void;
}> = ({ onAddStation, onAddRse }) => {
  if (!onAddStation && !onAddRse) return null;
  return (
    <div className="flex items-center gap-1.5 py-0.5">
      <div className="h-px flex-1 bg-neutral-300" />
      {onAddStation && (
        <button className="rounded border border-neutral-300 bg-neutral-100 px-1.5 py-0.5 text-[10px] leading-[14px] font-medium hover:bg-neutral-200" onClick={onAddStation}>
          + Station
        </button>
      )}
      {onAddRse && (
        <button className="rounded border border-neutral-300 bg-neutral-100 px-1.5 py-0.5 text-[10px] leading-[14px] font-medium hover:bg-neutral-200" onClick={onAddRse}>
          ↪ Road
        </button>
      )}
      <div className="h-px flex-1 bg-neutral-300" />
    </div>
  );
};

export default InsertionButtons;
