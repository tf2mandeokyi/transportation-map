import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { LineAtNodeData, LineAtRoadSectionData, NetworkFocusedElement, NodeData, RoadCreationSnap, RoadData } from '@/common/messages';
import { useMessageManager } from './MessageContext';
import { AddingRoadUISession } from '../sessions/adding-road';
import { useUISession } from '../sessions/useUISession';

type RoadSnapState = {
  startSnap: RoadCreationSnap;
  endSnap:   RoadCreationSnap;
} | null;

// Split in two so a consumer that only cares about the network graph itself (nodes/roads/
// selection) doesn't re-render on every road-creation snap update or line-pass data push,
// and vice versa — those change at very different rates and for unrelated reasons.
interface NetworkDataContextValue {
  nodes: NodeData[];
  roads: RoadData[];
  networkFocus: NetworkFocusedElement | null;
}

interface NetworkSessionContextValue {
  nodeLinesData: LineAtNodeData[];
  roadLinesData: LineAtRoadSectionData[];
  isAddingRoad: boolean;
  roadSnapState: RoadSnapState;
  roadSnapModeEnabled: boolean;
  handleStartRoadCreation:   () => void;
  handleConfirmRoadCreation: () => void;
  handleCancelRoadCreation:  () => void;
  handleSetRoadSnapMode:     (enabled: boolean) => void;
}

const NetworkDataContext = createContext<NetworkDataContextValue | null>(null);
const NetworkSessionContext = createContext<NetworkSessionContextValue | null>(null);

export const NetworkProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const manager = useMessageManager();
  const { open, close, send } = useUISession<AddingRoadUISession>();

  const [nodes, setNodes] = useState<NodeData[]>([]);
  const [roads, setRoads] = useState<RoadData[]>([]);
  const [networkFocus, setNetworkFocus] = useState<NetworkFocusedElement | null>(null);
  const [nodeLinesData, setNodeLinesData] = useState<LineAtNodeData[]>([]);
  const [roadLinesData, setRoadLinesData] = useState<LineAtRoadSectionData[]>([]);
  const [isAddingRoad, setIsAddingRoad] = useState(false);
  const [roadSnapState, setRoadSnapState] = useState<RoadSnapState>(null);
  const [roadSnapModeEnabled, setRoadSnapModeEnabled] = useState(true);

  useEffect(() => {
    const unsub1 = manager.onMessage('network-data', msg => {
      setNodes(msg.nodes);
      setRoads(msg.roads);
    });
    const unsub2 = manager.onMessage('network-element-focused', msg => {
      setNetworkFocus(msg.element);
    });
    const unsub3 = manager.onMessage('network-selection-cleared', () => {
      setNetworkFocus(null);
    });
    const unsub4 = manager.onMessage('road-creation-snap-update', msg => {
      setRoadSnapState({ startSnap: msg.startSnap, endSnap: msg.endSnap });
    });
    const unsub5 = manager.onMessage('road-creation-exited', () => {
      setIsAddingRoad(false);
      setRoadSnapState(null);
    });
    const unsub6 = manager.onMessage('node-lines-data', msg => {
      setNodeLinesData(msg.lines);
    });
    const unsub7 = manager.onMessage('road-lines-data', msg => {
      setRoadLinesData(msg.lines);
    });
    return () => { unsub1(); unsub2(); unsub3(); unsub4(); unsub5(); unsub6(); unsub7(); };
  }, [manager]);

  const handleStartRoadCreation = useCallback(() => {
    open(new AddingRoadUISession()).start(manager);
    setIsAddingRoad(true);
    setRoadSnapState(null);
    setRoadSnapModeEnabled(true);
  }, [manager, open]);

  const handleSetRoadSnapMode = useCallback((enabled: boolean) => {
    setRoadSnapModeEnabled(enabled);
    send(s => s.setSnapMode(enabled));
  }, [send]);

  const handleConfirmRoadCreation = useCallback(() => {
    close(s => s.confirm());
    setIsAddingRoad(false);
    setRoadSnapState(null);
  }, [close]);

  const handleCancelRoadCreation = useCallback(() => {
    close(s => s.cancel());
    setIsAddingRoad(false);
    setRoadSnapState(null);
  }, [close]);

  const dataValue = useMemo<NetworkDataContextValue>(() => ({
    nodes, roads, networkFocus,
  }), [nodes, roads, networkFocus]);

  const sessionValue = useMemo<NetworkSessionContextValue>(() => ({
    nodeLinesData, roadLinesData, isAddingRoad, roadSnapState, roadSnapModeEnabled,
    handleStartRoadCreation, handleConfirmRoadCreation, handleCancelRoadCreation, handleSetRoadSnapMode,
  }), [
    nodeLinesData, roadLinesData, isAddingRoad, roadSnapState, roadSnapModeEnabled,
    handleStartRoadCreation, handleConfirmRoadCreation, handleCancelRoadCreation, handleSetRoadSnapMode,
  ]);

  return (
    <NetworkDataContext.Provider value={dataValue}>
      <NetworkSessionContext.Provider value={sessionValue}>
        {children}
      </NetworkSessionContext.Provider>
    </NetworkDataContext.Provider>
  );
};

export const useNetworkDataContext = (): NetworkDataContextValue => {
  const ctx = useContext(NetworkDataContext);
  if (!ctx) throw new Error('useNetworkDataContext must be used within NetworkProvider');
  return ctx;
};

export const useNetworkSessionContext = (): NetworkSessionContextValue => {
  const ctx = useContext(NetworkSessionContext);
  if (!ctx) throw new Error('useNetworkSessionContext must be used within NetworkProvider');
  return ctx;
};
