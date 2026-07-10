import { describe, it, expect } from 'vitest';
import { MapState } from '../models/structures/map-state';
import { Road } from '../models/structures/road';
import { RoadSection } from '../models/structures/road-section';
import { Station } from '../models/structures/station';
import { Line } from '../models/structures/line';
import { RoadSectionPass } from '../models/structures/line-path';
import { validateLinePaths } from './line-validator';
import { RoadId, SectionId, StationId, LineId } from '@/common/types';

// Builds a single-section road with stations at fixed positions — no endpoints
// needed, since validateLinePaths never touches pass.fromNode/toNode (that's
// purely display-entries.ts's concern).
function buildSection(state: MapState, positions: Record<string, number>): { section: RoadSection; stations: Record<string, Station> } {
  const road = new Road(state, 'r1' as RoadId);
  state.addRoad(road);

  const section = new RoadSection(state, 's1' as SectionId).applyProps(road, { index: 0 });

  const stations: Record<string, Station> = {};
  for (const [name, interpT] of Object.entries(positions)) {
    const station = new Station(state, name as StationId).applyProps({
      name,
      textAlign: 'left',
      textHAlign: 'left',
      textRotation: 0,
      flipped: false,
      interpT,
      roadSection: section,
    });
    station.setParent(section);
    state.addStation(station);
    stations[name] = station;
  }
  section.stations = Object.values(stations);

  return { section, stations };
}

function buildLine(state: MapState, paths: RoadSectionPass[]): Line {
  const line = new Line(state, 'l1' as LineId).applyProps({
    name: 'Test Line',
    color: '#ff0000',
    isCircular: false,
    paths: [],
    figmaGroupId: null,
  });
  state.addLine(line);
  line.paths = paths;
  return line;
}

function makePass(
  section: RoadSection,
  direction: 'ascending' | 'descending',
  realStops: Array<{ station: Station; rank?: number }>,
  fromRank = 0, toRank = 0,
): RoadSectionPass {
  const pass = new RoadSectionPass();
  pass.section = section;
  pass.direction = direction;
  pass.fromRank = fromRank;
  pass.toRank = toRank;
  pass.stops = realStops.map(({ station, rank }) => ({ station, rank: rank ?? 0, stops: true }));
  return pass;
}

function summarize(line: Line): { id: string; stops: boolean }[] {
  return line.paths.flatMap(p => p.stops.map(s => ({ id: s.station.id, stops: s.stops })));
}

describe('validateLinePaths — pass-through regeneration', () => {
  it('fills in every other station of the section as an (unchecked) pass-through, sorted by direction', () => {
    const state = new MapState();
    const { section, stations } = buildSection(state, { A: 0.1, B: 0.3, C: 0.5, D: 0.7, E: 0.9 });

    const line = buildLine(state, [makePass(section, 'ascending', [{ station: stations.C }])]);
    line.paths = validateLinePaths(line);

    expect(summarize(line)).toEqual([
      { id: 'A', stops: false },
      { id: 'B', stops: false },
      { id: 'C', stops: true },
      { id: 'D', stops: false },
      { id: 'E', stops: false },
    ]);
  });

  it('sorts descending passes in reverse interpT order', () => {
    const state = new MapState();
    const { section, stations } = buildSection(state, { A: 0.1, B: 0.5, C: 0.9 });

    const line = buildLine(state, [makePass(section, 'descending', [{ station: stations.A }, { station: stations.C }])]);
    line.paths = validateLinePaths(line);

    expect(summarize(line)).toEqual([
      { id: 'C', stops: true },
      { id: 'B', stops: false },
      { id: 'A', stops: true },
    ]);
  });

  it('leaves a pass with no real stops fully pass-through (e.g. a freshly inserted connector)', () => {
    const state = new MapState();
    const { section } = buildSection(state, { A: 0.2, B: 0.8 });

    const line = buildLine(state, [makePass(section, 'ascending', [])]);
    line.paths = validateLinePaths(line);

    expect(summarize(line)).toEqual([
      { id: 'A', stops: false },
      { id: 'B', stops: false },
    ]);
  });

  it('preserves a pass-through\'s previously-saved rank across revalidation, keyed by station+direction', () => {
    const state = new MapState();
    const { section, stations } = buildSection(state, { A: 0.1, B: 0.5 });

    const line = buildLine(state, [makePass(section, 'ascending', [{ station: stations.B }])]);
    line.paths = validateLinePaths(line);
    // A is now a pass-through with the default rank (0) — bump it, simulating a
    // rank-normalization pass elsewhere (e.g. Station.getStopsAcrossLines).
    line.paths[0].stops.find(s => s.station === stations.A)!.rank = 3;

    // Re-validating (nothing else changed) must not reset that rank back to 0.
    line.paths = validateLinePaths(line);
    expect(line.paths[0].stops.find(s => s.station === stations.A)!.rank).toBe(3);
  });

  it('does not touch fromRank/toRank or direction, or reorder multiple passes', () => {
    const state = new MapState();
    const { section: secA, stations: stA } = buildSection(state, { A: 0.5 });
    const { section: secB, stations: stB } = buildSection(state, { B: 0.5 });

    const line = buildLine(state, [
      makePass(secA, 'ascending', [{ station: stA.A }], 2, 5),
      makePass(secB, 'descending', [{ station: stB.B }], 7, 9),
    ]);
    line.paths = validateLinePaths(line);

    expect(line.paths).toHaveLength(2);
    expect(line.paths[0].section).toBe(secA);
    expect(line.paths[0].direction).toBe('ascending');
    expect(line.paths[0].fromRank).toBe(2);
    expect(line.paths[0].toRank).toBe(5);
    expect(line.paths[1].section).toBe(secB);
    expect(line.paths[1].direction).toBe('descending');
    expect(line.paths[1].fromRank).toBe(7);
    expect(line.paths[1].toRank).toBe(9);
  });
});
