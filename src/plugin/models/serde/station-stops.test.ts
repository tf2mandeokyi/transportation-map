import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import { MapState } from '../structures/map-state';
import { StationStop } from '../structures/line-path';
import { RoadSection } from '../structures/road-section';
import { DATA_PATH, initState } from './test-helpers';

let state: MapState;

beforeAll(() => {
  const json = fs.readFileSync(DATA_PATH, 'utf-8');
  state = initState(json);
});

describe('station stop ranks', () => {
  it('no two lines stop at the same station with the same rank', () => {
    for (const station of state.getStations()) {
      const ranksPerSection = new Map<RoadSection, number[]>();
      for (const line of state.getLines()) {
        for (const p of line.paths) {
          if (!(p instanceof StationStop)) continue;
          if (p.station !== station) continue;
          const sec = p.station.parentRoadSection as RoadSection;
          const list = ranksPerSection.get(sec) ?? [];
          list.push(p.rank);
          ranksPerSection.set(sec, list);
        }
      }
      for (const [sec, ranks] of ranksPerSection) {
        const unique = new Set(ranks);
        expect(unique.size, `station "${station.id}" in section "${sec.id}": duplicate stop ranks ${JSON.stringify(ranks)}`).toBe(ranks.length);
      }
    }
  });

  it('station stop ranks form a compact 0..n-1 sequence per section', () => {
    for (const station of state.getStations()) {
      const ranksPerSection = new Map<RoadSection, number[]>();
      for (const line of state.getLines()) {
        for (const p of line.paths) {
          if (!(p instanceof StationStop)) continue;
          if (p.station !== station) continue;
          const sec = p.station.parentRoadSection as RoadSection;
          const list = ranksPerSection.get(sec) ?? [];
          list.push(p.rank);
          ranksPerSection.set(sec, list);
        }
      }
      for (const [sec, ranks] of ranksPerSection) {
        const sorted = [...ranks].sort((a, b) => a - b);
        const expected = sorted.map((_, i) => i);
        expect(sorted, `station "${station.id}" in section "${sec.id}": ranks ${JSON.stringify(sorted)} are not compact`).toEqual(expected);
      }
    }
  });
});
