import React from 'react';

const InsertionButtons: React.FC<{
  onAddStation?: () => void;
  onAddRse?: () => void;
}> = ({ onAddStation, onAddRse }) => {
  if (!onAddStation && !onAddRse) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '2px 0' }}>
      <div style={{ flex: 1, height: '1px', background: '#d0d0d0' }} />
      {onAddStation && (
        <button className="button button--secondary" style={{ fontSize: '10px', padding: '2px 6px', lineHeight: '14px' }} onClick={onAddStation}>
          + Station
        </button>
      )}
      {onAddRse && (
        <button className="button button--secondary" style={{ fontSize: '10px', padding: '2px 6px', lineHeight: '14px' }} onClick={onAddRse}>
          ↪ Road
        </button>
      )}
      <div style={{ flex: 1, height: '1px', background: '#d0d0d0' }} />
    </div>
  );
};

export default InsertionButtons;
