import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { LineData } from '@/common/messages';
import { LineId } from '@/common/types';
import { useMessageManager } from './MessageContext';

interface LinesContextValue {
  lines: LineData[];
  currentEditingLineId: LineId | null;
  // Guarded: if the editor has reported unsaved changes (see setIsEditorDirty), a
  // switch to a *different* target (including back to the list, id === null) is
  // held in pendingLineSwitch instead of applied immediately.
  setCurrentEditingLineId: (id: LineId | null) => void;
  removeLine: (lineId: LineId) => void;
  reorderLines: (lines: LineData[]) => void;
  isEditorDirty: boolean;
  setIsEditorDirty: (dirty: boolean) => void;
  pendingLineSwitch: { target: LineId | null } | null;
  confirmPendingLineSwitch: () => void;
  cancelPendingLineSwitch: () => void;
}

const LinesContext = createContext<LinesContextValue | null>(null);

export const LinesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const manager = useMessageManager();
  const [lines, setLines] = useState<LineData[]>([]);
  const [currentEditingLineId, setRawEditingLineId] = useState<LineId | null>(null);
  const [isEditorDirty, setIsEditorDirty] = useState(false);
  const [pendingLineSwitch, setPendingLineSwitch] = useState<{ target: LineId | null } | null>(null);

  useEffect(() => {
    const unsub1 = manager.onMessage('line-added', msg => {
      setLines(prev => {
        const exists = prev.some(l => l.id === msg.id);
        if (exists) return prev.map(l => l.id === msg.id ? { id: msg.id, name: msg.name, color: msg.color } : l);
        return [...prev, { id: msg.id, name: msg.name, color: msg.color }];
      });
    });
    return () => { unsub1(); };
  }, [manager]);

  const removeLine = useCallback((lineId: LineId) => {
    setLines(prev => prev.filter(l => l.id !== lineId));
  }, []);

  const reorderLines = useCallback((newLines: LineData[]) => {
    setLines(newLines);
  }, []);

  const setCurrentEditingLineId = useCallback((id: LineId | null) => {
    setRawEditingLineId(current => {
      if (isEditorDirty && id !== current) {
        setPendingLineSwitch({ target: id });
        return current;
      }
      setIsEditorDirty(false);
      return id;
    });
  }, [isEditorDirty]);

  const confirmPendingLineSwitch = useCallback(() => {
    setPendingLineSwitch(pending => {
      if (pending) {
        setIsEditorDirty(false);
        setRawEditingLineId(pending.target);
      }
      return null;
    });
  }, []);

  const cancelPendingLineSwitch = useCallback(() => setPendingLineSwitch(null), []);

  return (
    <LinesContext.Provider value={{
      lines, currentEditingLineId, setCurrentEditingLineId, removeLine, reorderLines,
      isEditorDirty, setIsEditorDirty, pendingLineSwitch, confirmPendingLineSwitch, cancelPendingLineSwitch,
    }}>
      {children}
    </LinesContext.Provider>
  );
};

export const useLinesContext = (): LinesContextValue => {
  const ctx = useContext(LinesContext);
  if (!ctx) throw new Error('useLinesContext must be used within LinesProvider');
  return ctx;
};
