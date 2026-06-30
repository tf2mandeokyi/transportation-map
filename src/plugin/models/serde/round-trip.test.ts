import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import { MapState } from '../structures/map-state';
import { serializeMapState } from './index';
import { StationStop, RoadSectionChange } from '../structures/line-path';
import { DATA_PATH, initState } from './test-helpers';

let state: MapState;

beforeAll(() => {
  const json = fs.readFileSync(DATA_PATH, 'utf-8');
  state = initState(json);
});

describe('normalize → serialize → deserialize round-trip', () => {
  it('produces identical ranks after a second normalize pass', () => {
    const json = serializeMapState(state);
    const state2 = initState(json);

    for (const line of state.getLines()) {
      const line2 = state2.getLineHarsh(line.id);
      for (let i = 0; i < line.paths.length; i++) {
        const p = line.paths[i];
        const p2 = line2.paths[i];
        if (p instanceof StationStop && p2 instanceof StationStop) {
          expect(p2.rank,  `line "${line.id}" path ${i} station stop rank`).toBe(p.rank);
          expect(p2.stops, `line "${line.id}" path ${i} station stop stops`).toBe(p.stops);
        } else if (p instanceof RoadSectionChange && p2 instanceof RoadSectionChange) {
          expect(p2.enterRank, `line "${line.id}" path ${i} enterRank`).toBe(p.enterRank);
          expect(p2.exitRank,  `line "${line.id}" path ${i} exitRank`).toBe(p.exitRank);
        }
      }
    }
  });
});
