import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { LineAtNodeData, NetworkFocusedElement, NodeData, RoadData } from '@/common/messages';
import { NodeId } from '@/common/types';
import { useMessageManager } from './MessageContext';
import { AddingRoadUISession } from '../sessions/adding-road';
import { useUISession } from '../sessions/useUISession';

type RoadSnapState = {
  startSnap: { nodeId: NodeId; name?: string } | null;
  endSnap:   { nodeId: NodeId; name?: string } | null;
} | null;

interface NetworkContextValue {
  nodes: NodeData[];
  roads: RoadData[];
  networkFocus: NetworkFocusedElement | null;
  nodeLinesData: LineAtNodeData[];
  isAddingRoad: boolean;
  roadSnapState: RoadSnapState;
  handleStartRoadCreation:   () => void;
  handleConfirmRoadCreation: () => void;
  handleCancelRoadCreation:  () => void;
}

const NetworkContext = createContext<NetworkContextValue | null>(null);

export const NetworkProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const manager = useMessageManager();
  const { open, close } = useUISession<AddingRoadUISession>();

  const [nodes, setNodes] = useState<NodeData[]>([]);
  const [roads, setRoads] = useState<RoadData[]>([]);
  const [networkFocus, setNetworkFocus] = useState<NetworkFocusedElement | null>(null);
  const [nodeLinesData, setNodeLinesData] = useState<LineAtNodeData[]>([]);
  const [isAddingRoad, setIsAddingRoad] = useState(false);
  const [roadSnapState, setRoadSnapState] = useState<RoadSnapState>(null);

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
    return () => { unsub1(); unsub2(); unsub3(); unsub4(); unsub5(); unsub6(); };
  }, [manager]);

  const handleStartRoadCreation = useCallback(() => {
    open(new AddingRoadUISession()).start(manager);
    setIsAddingRoad(true);
    setRoadSnapState(null);
  }, [manager, open]);

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

  return (
    <NetworkContext.Provider value={{
      nodes, roads, networkFocus, nodeLinesData,
      isAddingRoad, roadSnapState,
      handleStartRoadCreation, handleConfirmRoadCreation, handleCancelRoadCreation,
    }}>
      {children}
    </NetworkContext.Provider>
  );
};

export const useNetworkContext = (): NetworkContextValue => {
  const ctx = useContext(NetworkContext);
  if (!ctx) throw new Error('useNetworkContext must be used within NetworkProvider');
  return ctx;
};
