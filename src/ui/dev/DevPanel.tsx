import React from 'react';
import { simulateNodeFocus, simulateRoadFocus, simulateRoadSnap, simulateSelectionCleared, simulateStationClick } from './seed';

const buttons: Array<[string, () => void]> = [
  ['Simulate station click', simulateStationClick],
  ['Simulate node focus', simulateNodeFocus],
  ['Simulate road focus', simulateRoadFocus],
  ['Simulate road-creation snap', simulateRoadSnap],
  ['Clear selection', simulateSelectionCleared],
];

const DevPanel: React.FC = () => (
  <div className="fixed bottom-0 right-0 z-50 flex flex-col gap-1 bg-black/80 p-2 text-[10px] text-white">
    {buttons.map(([label, fn]) => (
      <button key={label} className="cursor-pointer rounded bg-white/10 px-2 py-1 text-left hover:bg-white/20" onClick={fn}>
        {label}
      </button>
    ))}
  </div>
);

export default DevPanel;
