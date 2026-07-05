import type { PluginToUIMessage } from '@/common/messages';
import type { LineId, NodeId, RoadId, RoadSectionId, StationId } from '@/common/types';

const nodeId = (id: string) => id as NodeId;
const roadId = (id: string) => id as RoadId;
const lineId = (id: string) => id as LineId;
const stationId = (id: string) => id as StationId;
const sectionId = (roadId_: string, id: string): RoadSectionId => [roadId(roadId_), id as RoadSectionId[1]];

function send(msg: PluginToUIMessage) {
  window.postMessage({ pluginMessage: msg }, '*');
}

export function seedFakeData() {
  send({ type: 'line-added', id: lineId('line-1'), name: 'Red Line', color: '#e63946' });
  send({ type: 'line-added', id: lineId('line-2'), name: 'Blue Line', color: '#1d3557' });
  send({ type: 'line-added', id: lineId('line-3'), name: 'Green Circle', color: '#2a9d8f' });

  send({
    type: 'network-data',
    nodes: [
      { id: nodeId('node-1'), name: 'Central Junction', pos: { x: 100, y: 100 } },
      { id: nodeId('node-2'), name: 'North Yard', pos: { x: 300, y: 40 } },
      { id: nodeId('node-3'), pos: { x: 300, y: 220 } },
    ],
    roads: [
      {
        id: roadId('road-1'),
        name: 'Main Ave',
        startNodeId: nodeId('node-1'),
        endNodeId: nodeId('node-2'),
        sections: [{ id: sectionId('road-1', 'section-1'), name: 'Segment A', index: 0 }],
      },
      {
        id: roadId('road-2'),
        startNodeId: nodeId('node-1'),
        endNodeId: nodeId('node-3'),
        sections: [
          { id: sectionId('road-2', 'section-2'), name: 'Segment B', index: 0 },
          { id: sectionId('road-2', 'section-3'), index: 1 },
        ],
      },
    ],
  });
}

export function simulateStationClick() {
  send({
    type: 'station-clicked',
    stationId: stationId('station-1'),
    station: { name: 'Sample Station', textAlign: 'right', textHAlign: 'left', textRotation: 0, flipped: false },
    lines: [
      { id: lineId('line-1'), name: 'Red Line', color: '#e63946', groupIndex: 0, stopIndex: 0, rank: 0, facing: 'left', stops: true },
      { id: lineId('line-2'), name: 'Blue Line', color: '#1d3557', groupIndex: 0, stopIndex: 1, rank: 1, facing: 'right', stops: false },
    ],
  });
}

export function simulateNodeFocus() {
  send({ type: 'network-element-focused', element: { kind: 'node', nodeId: nodeId('node-1'), name: 'Central Junction', pos: { x: 100, y: 100 } } });
  send({
    type: 'node-lines-data',
    nodeId: nodeId('node-1'),
    lines: [
      { lineId: lineId('line-1'), lineName: 'Red Line', lineColor: '#e63946', groupIndex: 0, exitingSectionId: sectionId('road-1', 'section-1'), enteringSectionId: sectionId('road-2', 'section-2'), exitRank: 0, enterRank: 0 },
    ],
  });
}

export function simulateRoadFocus() {
  send({
    type: 'network-element-focused',
    element: {
      kind: 'road',
      roadId: roadId('road-1'),
      name: 'Main Ave',
      startNodeId: nodeId('node-1'),
      endNodeId: nodeId('node-2'),
      sections: [{ id: sectionId('road-1', 'section-1'), name: 'Segment A', index: 0 }],
    },
  });
}

export function simulateSelectionCleared() {
  send({ type: 'network-selection-cleared' });
}

export function simulateRoadSnap() {
  send({
    type: 'road-creation-snap-update',
    startSnap: { nodeId: nodeId('node-1'), name: 'Central Junction' },
    endSnap: { nodeId: nodeId('node-2'), name: 'North Yard' },
  });
}
