import React, { useEffect, useState } from 'react';
import StationsSection from '../components/StationsSection';
import EditStationSection from '../components/EditStationSection';
import NetworkSection from '../components/NetworkSection';
import SettingsSection from '../components/SettingsSection';
import { postMessageToPlugin } from '../figma';
import Button from '../components/common/Button';
import NavButton from './NavButton';
import LineTabContent from './LineTabContent';
import { useMessageManager } from '../contexts/MessageContext';

type Tab = 'stations' | 'lines' | 'network' | 'settings';

// True while the focused element would itself consume Ctrl+Z (a text field) —
// undo/redo shortcuts must not hijack that, or editing a station/line name would
// undo the whole map instead of the user's last keystroke.
function isEditingText(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || (el as HTMLElement).isContentEditable;
}

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('stations');
  const manager = useMessageManager();
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  useEffect(() => {
    postMessageToPlugin({ type: 'request-initial-data' });
  }, []);

  useEffect(() => {
    return manager.onMessage('undo-state', msg => {
      setCanUndo(msg.canUndo);
      setCanRedo(msg.canRedo);
    });
  }, [manager]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z' || isEditingText()) return;
      e.preventDefault();
      if (e.shiftKey) {
        if (canRedo) postMessageToPlugin({ type: 'redo' });
      } else {
        if (canUndo) postMessageToPlugin({ type: 'undo' });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canUndo, canRedo]);

  return (
    <div className="p-4 font-sans text-xs text-neutral-900">
      <div className="mb-4 flex gap-2">
        <Button className="flex-1" onClick={() => postMessageToPlugin({ type: 'undo' })} disabled={!canUndo} title="Undo (Ctrl+Z)">
          ↶ Undo
        </Button>
        <Button className="flex-1" onClick={() => postMessageToPlugin({ type: 'redo' })} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
          ↷ Redo
        </Button>
      </div>
      <div className="mb-4">
        <Button fullWidth onClick={() => postMessageToPlugin({ type: 'render-map' })}>
          Render Map
        </Button>
      </div>

      <div className="mb-4 flex border-b border-neutral-200">
        <NavButton active={activeTab === 'stations'} onClick={() => setActiveTab('stations')}>Stations</NavButton>
        <NavButton active={activeTab === 'lines'}    onClick={() => setActiveTab('lines')}>Lines</NavButton>
        <NavButton active={activeTab === 'network'}  onClick={() => setActiveTab('network')}>Network</NavButton>
        <NavButton active={activeTab === 'settings'} onClick={() => setActiveTab('settings')}>Settings</NavButton>
      </div>

      {activeTab === 'stations' && (
        <div>
          <StationsSection />
          <EditStationSection />
        </div>
      )}
      {activeTab === 'lines'    && <LineTabContent />}
      {activeTab === 'network'  && <NetworkSection />}
      {activeTab === 'settings' && <SettingsSection />}
    </div>
  );
};

export default App;
