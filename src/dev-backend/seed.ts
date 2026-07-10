import type { PluginToUIMessage, NodeData, RoadData, RoadSectionData, UIToPluginMessage } from '@/common/messages';
import type { LineId, NodeId, RoadId, RoadSectionId, StationId } from '@/common/types';
import { MapState } from '../plugin/models/structures/map-state';
import { deserializeMapState } from '../plugin/models/serde';
import { validateLinePaths } from '../plugin/utils/line-validator';
import { getLinePathData } from '../plugin/utils/get-line-path-data';

// Backs 'get-line-path' responses below — only set when seeded from a real
// saved map (seedFakeData's lines have no paths, so there's nothing to serve).
let seededState: MapState | null = null;

const nodeId = (id: string) => id as NodeId;
const roadId = (id: string) => id as RoadId;
const lineId = (id: string) => id as LineId;
const stationId = (id: string) => id as StationId;
const sectionId = (roadId_: string, id: string): RoadSectionId => [roadId(roadId_), id as RoadSectionId[1]];

function send(msg: PluginToUIMessage) {
  window.postMessage({ pluginMessage: msg }, '*');
}

// Mirrors LineController.syncLinesToUI + NetworkController.syncNetworkToUI, which is
// what the real plugin sends to the UI on load.
function seedFromMapState(state: MapState) {
  for (const line of state.getLines()) {
    send({ type: 'line-added', id: line.id, name: line.name, color: line.color });
  }

  const nodes: NodeData[] = [...state.getNodes()].map(n => ({ id: n.id, name: n.name, pos: n.getCenter() }));
  const roads: RoadData[] = [...state.getRoads()].map(r => ({
    id: r.id,
    name: r.name,
    startNodeId: r.endpoints[0].node.id,
    endNodeId: r.endpoints[1].node.id,
    sections: [...r.getSections()].map((s): RoadSectionData => ({ id: s.getRoadSectionId(), name: s.name, index: s.index })),
  }));
  send({ type: 'network-data', nodes, roads });
}

// Seeds from a real saved map at tmp/data.json when present (served by the dev vite
// config), falling back to hardcoded fake data otherwise.
export async function seedInitialData() {
  try {
    const res = await fetch('/__dev-data.json');
    if (res.ok) {
      const json = await res.text();
      const state = new MapState();
      if (deserializeMapState(json, state)) {
        for (const line of state.getLines()) line.paths = validateLinePaths(line);
        state.normalize();
        seededState = state;
        seedFromMapState(state);
        return;
      }
    }
  } catch {
    // fall through to fake data
  }
  seedFakeData();
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

// Stands in for the real plugin's postMessage round-trip: intercepts messages
// the UI sends outward (see figma.ts's postRawMessageToPlugin) and answers the
// ones the edit-line-path panel depends on, using the map seeded above and the
// same pure computation ConnectionController.handleGetLinePath uses on the real side.
export function installFakeBackend() {
  window.addEventListener('message', event => {
    const msg: UIToPluginMessage | undefined = event.data?.pluginMessage?.msg;
    if (!msg || msg.type !== 'get-line-path') return;
    if (!seededState) return;

    const data = getLinePathData(seededState, msg.lineId);
    if (!data) return;

    send({ type: 'line-path-data', ...data });
  });
}

export function simulateStationClick() {
  send({
    type: 'station-clicked',
    stationId: stationId('station-1'),
    station: { name: 'Sample Station', textAlign: 'right', textHAlign: 'left', textRotation: 0, flipped: false },
    lines: [
      { id: lineId('line-1'), name: 'Red Line', color: '#e63946', passIndex: 0, rank: 0, facing: 'left', stops: true },
      { id: lineId('line-2'), name: 'Blue Line', color: '#1d3557', passIndex: 0, rank: 1, facing: 'right', stops: false },
    ],
  });
}

export function simulateNodeFocus() {
  send({ type: 'network-element-focused', element: { kind: 'node', nodeId: nodeId('node-1'), name: 'Central Junction', pos: { x: 100, y: 100 } } });
  send({
    type: 'node-lines-data',
    nodeId: nodeId('node-1'),
    lines: [
      { lineId: lineId('line-1'), lineName: 'Red Line', lineColor: '#e63946', exitingPassIndex: 0, enteringPassIndex: 1, exitingSectionId: sectionId('road-1', 'section-1'), enteringSectionId: sectionId('road-2', 'section-2'), exitRank: 0, enterRank: 0 },
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
    startSnap: { kind: 'node', nodeId: nodeId('node-1'), name: 'Central Junction' },
    endSnap: { kind: 'node', nodeId: nodeId('node-2'), name: 'North Yard' },
  });
}
