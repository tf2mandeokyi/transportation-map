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
      for (let gi = 0; gi < line.paths.length; gi++) {
        const g = line.paths[gi];
        const g2 = line2.paths[gi];
        const rsc = g.fromRoadSectionChange;
        const rsc2 = g2.fromRoadSectionChange;
        if (rsc && rsc2) {
          expect(rsc2.enterRank, `line "${line.id}" group ${gi} enterRank`).toBe(rsc.enterRank);
          expect(rsc2.exitRank,  `line "${line.id}" group ${gi} exitRank`).toBe(rsc.exitRank);
        }
        for (let si = 0; si < g.stationStops.length; si++) {
          const p = g.stationStops[si];
          const p2 = g2.stationStops[si];
          expect(p2.rank,  `line "${line.id}" group ${gi} stop ${si} station stop rank`).toBe(p.rank);
          expect(p2.stops, `line "${line.id}" group ${gi} stop ${si} station stop stops`).toBe(p.stops);
        }
      }
    }
  });
});
