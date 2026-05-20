import React, { createContext, useContext, useEffect, useRef } from 'react';
import { PluginToUIMessage } from '@/common/messages';
import { FigmaPluginMessageManager } from '../events';

const MessageContext = createContext<FigmaPluginMessageManager | null>(null);

export const MessageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const manager = useRef(new FigmaPluginMessageManager()).current;

  useEffect(() => {
    window.onmessage = (event) => {
      const msg: PluginToUIMessage = event.data.pluginMessage;
      if (msg) manager.handleMessage(msg);
    };
  }, []);

  return <MessageContext.Provider value={manager}>{children}</MessageContext.Provider>;
};

export const useMessageManager = (): FigmaPluginMessageManager => {
  const ctx = useContext(MessageContext);
  if (!ctx) throw new Error('useMessageManager must be used within MessageProvider');
  return ctx;
};
