import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { LineData } from '@/common/messages';
import { LineId } from '@/common/types';
import { useMessageManager } from './MessageContext';

interface LinesContextValue {
  lines: LineData[];
  currentEditingLineId: LineId | null;
  setCurrentEditingLineId: (id: LineId | null) => void;
  removeLine: (lineId: LineId) => void;
  reorderLines: (lines: LineData[]) => void;
}

const LinesContext = createContext<LinesContextValue | null>(null);

export const LinesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const manager = useMessageManager();
  const [lines, setLines] = useState<LineData[]>([]);
  const [currentEditingLineId, setCurrentEditingLineId] = useState<LineId | null>(null);

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

  return (
    <LinesContext.Provider value={{ lines, currentEditingLineId, setCurrentEditingLineId, removeLine, reorderLines }}>
      {children}
    </LinesContext.Provider>
  );
};

export const useLinesContext = (): LinesContextValue => {
  const ctx = useContext(LinesContext);
  if (!ctx) throw new Error('useLinesContext must be used within LinesProvider');
  return ctx;
};
