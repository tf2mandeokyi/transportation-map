import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import { MapState } from '../structures/map-state';
import { DATA_PATH, initState, collectRscRanks } from './test-helpers';

let state: MapState;

beforeAll(() => {
  const json = fs.readFileSync(DATA_PATH, 'utf-8');
  state = initState(json);
});

describe('RSC enter ranks per section+side', () => {
  it('are unique', () => {
    const rscMap = collectRscRanks(state);
    for (const [key, { enterRanks }] of rscMap) {
      if (enterRanks.length < 2) continue;
      const unique = new Set(enterRanks);
      expect(unique.size, `section+side "${key}": duplicate enter ranks ${JSON.stringify(enterRanks)}`).toBe(enterRanks.length);
    }
  });
});

describe('RSC exit ranks per section+side', () => {
  it('are unique', () => {
    const rscMap = collectRscRanks(state);
    for (const [key, { exitRanks }] of rscMap) {
      if (exitRanks.length < 2) continue;
      const unique = new Set(exitRanks);
      expect(unique.size, `section+side "${key}": duplicate exit ranks ${JSON.stringify(exitRanks)}`).toBe(exitRanks.length);
    }
  });
});

// Enter and exit ranks at the same endpoint are rendered in the same stacking
// band, so together they must also form a compact sequence.
describe('RSC combined enter+exit ranks per section+side', () => {
  it('form a compact 0..n-1 sequence', () => {
    const rscMap = collectRscRanks(state);
    for (const [key, { enterRanks, exitRanks }] of rscMap) {
      const combined = [...enterRanks, ...exitRanks].sort((a, b) => a - b);
      if (combined.length < 2) continue;
      const expected = combined.map((_, i) => i);
      expect(combined, `section+side "${key}": combined enter+exit ranks ${JSON.stringify(combined)} are not compact`).toEqual(expected);
    }
  });
});
