import { describe, it, expect } from 'vitest';
import { MapState } from '../structures/map-state';
import { Road } from '../structures/road';
import { RoadSection } from '../structures/road-section';
import { Station } from '../structures/station';
import { Node } from '../structures/node';
import { Line } from '../structures/line';
import { RoadSectionPass } from '../structures/line-path';
import { DisplayEntry } from '@/common/messages';
import { buildDisplayEntries } from '../../utils/display-entries';
import { LineId, NodeId, RoadId, SectionId, StationId } from '@/common/types';
import { own } from '@/common/utils/ownership';

// Builds two roads sharing a junction node: "Central-North" (nCentral↔nNorth, one
// station) and "West-Central" (nWest↔nCentral, three stations) — the same shape as
// a line crossing from one road onto another at a shared junction.
function buildNetwork(state: MapState) {
  const nCentral = new Node(state, 'nCentral' as NodeId).applyProps({ name: 'Central Junction', position: { x: 0, y: 0 }, radius: 0 });
  const nNorth   = new Node(state, 'nNorth' as NodeId).applyProps({ name: 'North Junction', position: { x: 0, y: -100 }, radius: 0 });
  const nWest    = new Node(state, 'nWest' as NodeId).applyProps({ name: 'West Junction', position: { x: -100, y: 0 }, radius: 0 });
  state.addNode(nCentral); state.addNode(nNorth); state.addNode(nWest);

  const roadCN = new Road(state, 'rCN' as RoadId).applyProps({
    name: 'Central-North', bezierMidPoint: { x: 0, y: -50 },
    endpoints: [own({ node: nCentral, horizontalOffset: 0, groupNumber: 0 }), own({ node: nNorth, horizontalOffset: 0, groupNumber: 0 })],
  });
  const roadWC = new Road(state, 'rWC' as RoadId).applyProps({
    name: 'West-Central', bezierMidPoint: { x: -50, y: 0 },
    endpoints: [own({ node: nWest, horizontalOffset: 0, groupNumber: 0 }), own({ node: nCentral, horizontalOffset: 0, groupNumber: 0 })],
  });
  state.addRoad(roadCN); state.addRoad(roadWC);

  const secCN = new RoadSection(state, 'sCN' as SectionId).applyProps(roadCN, { index: 0 });
  const secWC = new RoadSection(state, 'sWC' as SectionId).applyProps(roadWC, { index: 0 });

  const north = new Station(state, 'north' as StationId).applyProps({ name: 'North Station', textAlign: 'left', textHAlign: 'left', textRotation: 0, flipped: false, interpT: 0.8, roadSection: secCN });
  north.setParent(secCN);
  secCN.stations = [north];
  state.addStation(north);

  const west    = new Station(state, 'west' as StationId).applyProps({ name: 'West Station', textAlign: 'left', textHAlign: 'left', textRotation: 0, flipped: false, interpT: 0.2, roadSection: secWC });
  const central = new Station(state, 'central' as StationId).applyProps({ name: 'Central Station', textAlign: 'left', textHAlign: 'left', textRotation: 0, flipped: false, interpT: 0.5, roadSection: secWC });
  const cityHall = new Station(state, 'cityHall' as StationId).applyProps({ name: 'City Hall West', textAlign: 'left', textHAlign: 'left', textRotation: 0, flipped: false, interpT: 0.8, roadSection: secWC });
  [west, central, cityHall].forEach(s => { s.setParent(secWC); state.addStation(s); });
  secWC.stations = [west, central, cityHall];

  return { nCentral, nNorth, nWest, secCN, secWC, north, west, central, cityHall };
}

function makePass(section: RoadSection, direction: 'ascending' | 'descending', stops: Array<{ station: Station; stops: boolean }>): RoadSectionPass {
  const pass = new RoadSectionPass();
  pass.section = section;
  pass.direction = direction;
  pass.fromRank = 0;
  pass.toRank = 0;
  pass.stops = stops.map(({ station, stops: real }) => ({ station, rank: 0, stops: real }));
  return pass;
}

function entries(line: Line): DisplayEntry[] {
  return buildDisplayEntries(line.paths);
}

function traversalStationNames(entry: DisplayEntry): string[] {
  if (entry.kind !== 'traversal') throw new Error('not a traversal entry');
  return entry.stations.map(s => s.name);
}

describe('display entries — straight crossing (North Station → Central Junction → West-Central)', () => {
  const state = new MapState();
  const { secCN, secWC, north, west, central, cityHall } = buildNetwork(state);
  const line = new Line(state, 'lineI' as LineId).applyProps({ name: 'Line I', color: '#800080', isCircular: false, paths: [], figmaGroupId: null });

  // Descending on Central-North (nNorth→nCentral), then descending on West-Central
  // (nCentral→nWest) — both toNode/fromNode meet at nCentral, so it's a straight
  // (non-U-turn) crossing.
  // display-entries.ts renders pass.stops in whatever order they're given (sorting
  // is the validator's job, not display's) — so stops are listed here already in
  // descending interpT order, matching what validateLinePaths would produce.
  line.paths = [
    makePass(secCN, 'descending', [{ station: north, stops: true }]),
    makePass(secWC, 'descending', [{ station: cityHall, stops: true }, { station: central, stops: true }, { station: west, stops: true }]),
  ];

  it('has exactly 5 entries: boundary, traversal, boundary, traversal, boundary', () => {
    const e = entries(line);
    expect(e).toHaveLength(5);
    expect(e.map(x => x.kind)).toEqual(['boundary', 'traversal', 'boundary', 'traversal', 'boundary']);
  });

  it('first traversal is descending and contains only North Station', () => {
    const t = entries(line)[1];
    if (t.kind !== 'traversal') throw new Error();
    expect(t.direction).toBe('descending');
    expect(traversalStationNames(t)).toEqual(['North Station']);
    expect(t.stations[0].stops).toBe(true);
    expect(t.stations[0].passIndex).toBe(0);
  });

  it('the interior boundary is not a U-turn and crosses at Central Junction', () => {
    const b = entries(line)[2];
    if (b.kind !== 'boundary') throw new Error();
    expect(b.isUturn).toBe(false);
    expect(b.nodeName).toBe('Central Junction');
    expect(b.fromRoadName).toBe('Central-North');
    expect(b.toRoadName).toBe('West-Central');
  });

  it('second traversal is descending and lists stations City Hall West, Central Station, West Station in order', () => {
    const t = entries(line)[3];
    if (t.kind !== 'traversal') throw new Error();
    expect(t.direction).toBe('descending');
    expect(traversalStationNames(t)).toEqual(['City Hall West', 'Central Station', 'West Station']);
    for (const s of t.stations) expect(s.stops).toBe(true);
  });

  it('the leading and trailing boundaries report the path\'s real start/end nodes, with no road on the missing side', () => {
    const e = entries(line);
    const lead = e[0] as Extract<DisplayEntry, { kind: 'boundary' }>;
    const trail = e[4] as Extract<DisplayEntry, { kind: 'boundary' }>;
    expect(lead.nodeName).toBe('North Junction');
    expect(lead.fromRoadName).toBeNull();
    expect(lead.toRoadName).toBe('Central-North');
    expect(trail.nodeName).toBe('West Junction');
    expect(trail.fromRoadName).toBe('West-Central');
    expect(trail.toRoadName).toBeNull();
  });
});

describe('display entries — U-turn (two adjacent passes over the same section)', () => {
  const state = new MapState();
  const { secWC, west, central, cityHall } = buildNetwork(state);
  const line = new Line(state, 'lineC' as LineId).applyProps({ name: 'Line C', color: '#ff0000', isCircular: false, paths: [], figmaGroupId: null });

  // Descending nCentral→nWest (Central real, West/City Hall pass-through), then
  // ascending nWest→nCentral (Central real again) — same section both times, so the
  // boundary between them is a U-turn.
  line.paths = [
    makePass(secWC, 'descending', [{ station: central, stops: true }, { station: cityHall, stops: false }, { station: west, stops: false }]),
    makePass(secWC, 'ascending',  [{ station: west, stops: false }, { station: cityHall, stops: false }, { station: central, stops: true }]),
  ];

  it('has exactly 5 entries: boundary, traversal, boundary(U-turn), traversal, boundary', () => {
    const e = entries(line);
    expect(e).toHaveLength(5);
    expect(e.map(x => x.kind)).toEqual(['boundary', 'traversal', 'boundary', 'traversal', 'boundary']);
  });

  it('the interior boundary is a U-turn at West Junction', () => {
    const b = entries(line)[2];
    if (b.kind !== 'boundary') throw new Error();
    expect(b.isUturn).toBe(true);
    expect(b.nodeName).toBe('West Junction');
  });

  it('descending traversal shows Central Station (stop) then City Hall West, West Station (pass-through)', () => {
    const t = entries(line)[1];
    if (t.kind !== 'traversal') throw new Error();
    expect(traversalStationNames(t)).toEqual(['Central Station', 'City Hall West', 'West Station']);
    expect(t.stations.map(s => s.stops)).toEqual([true, false, false]);
  });

  it('ascending traversal shows West Station, City Hall West (pass-through) then Central Station (stop)', () => {
    const t = entries(line)[3];
    if (t.kind !== 'traversal') throw new Error();
    expect(traversalStationNames(t)).toEqual(['West Station', 'City Hall West', 'Central Station']);
    expect(t.stations.map(s => s.stops)).toEqual([false, false, true]);
  });
});

describe('display entries — invalid jump', () => {
  it('reports a gap when adjacent passes do not connect at the same node', () => {
    const state = new MapState();
    const { secCN, secWC, north, central } = buildNetwork(state);
    const line = new Line(state, 'lineGap' as LineId).applyProps({ name: 'Gap Line', color: '#000000', isCircular: false, paths: [], figmaGroupId: null });

    // secCN descending ends at nCentral; secWC descending starts at nCentral too —
    // force a fabricated gap by using ascending on the second pass instead, whose
    // fromNode is nWest, not nCentral.
    line.paths = [
      makePass(secCN, 'descending', [{ station: north, stops: true }]),
      makePass(secWC, 'ascending', [{ station: central, stops: true }]),
    ];

    const e = entries(line);
    expect(e.map(x => x.kind)).toEqual(['boundary', 'traversal', 'invalid-jump', 'traversal', 'boundary']);
    const gap = e[2];
    if (gap.kind !== 'invalid-jump') throw new Error();
    expect(gap.fromNodeName).toBe('Central Junction');
    expect(gap.toNodeName).toBe('West Junction');
  });
});
