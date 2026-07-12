import React from 'react';
import Button from './Button';

// Pair of buttons attached to a ranked-pass list, letting the user re-sort it to
// match the main Lines list order (forward or reversed) instead of dragging manually.
const SortOrderButtons: React.FC<{ onSort: (reverse: boolean) => void }> = ({ onSort }) => (
  <div className="flex gap-1">
    <Button size="xxs" title="Sort by the Lines list order" onClick={() => onSort(false)}>Order</Button>
    <Button size="xxs" title="Sort by the Lines list order, reversed" onClick={() => onSort(true)}>Rev. Order</Button>
  </div>
);

export default SortOrderButtons;
