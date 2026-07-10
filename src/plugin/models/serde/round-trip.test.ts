import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import { MapState } from '../structures/map-state';
import { serializeMapState } from './index';
import { DATA_PATH, fixtureExists, initState } from './test-helpers';

let state: MapState;

beforeAll(() => {
  if (!fixtureExists) return;
  const json = fs.readFileSync(DATA_PATH, 'utf-8');
  state = initState(json);
});

describe.skipIf(!fixtureExists)('normalize → serialize → deserialize round-trip', () => {
  it('produces identical ranks after a second normalize pass', () => {
    const json = serializeMapState(state);
    const state2 = initState(json);

    for (const line of state.getLines()) {
      const line2 = state2.getLineHarsh(line.id);
      for (let pi = 0; pi < line.paths.length; pi++) {
        const p = line.paths[pi];
        const p2 = line2.paths[pi];
        expect(p2.fromRank, `line "${line.id}" pass ${pi} fromRank`).toBe(p.fromRank);
        expect(p2.toRank,   `line "${line.id}" pass ${pi} toRank`).toBe(p.toRank);
        for (let si = 0; si < p.stops.length; si++) {
          const s = p.stops[si];
          const s2 = p2.stops[si];
          expect(s2.rank,  `line "${line.id}" pass ${pi} stop ${si} station stop rank`).toBe(s.rank);
          expect(s2.stops, `line "${line.id}" pass ${pi} stop ${si} station stop stops`).toBe(s.stops);
        }
      }
    }
  });
});
