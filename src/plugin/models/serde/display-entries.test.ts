import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import { MapState } from '../structures/map-state';
import { Line } from '../structures/line';
import { DisplayEntry } from '@/common/messages';
import { buildDisplayEntries } from '../../utils/display-entries';
import { DATA_PATH, initState } from './test-helpers';

let state: MapState;
let lineI: Line;  // purple — Hr → RSC(q) → Y → y → P
let lineC: Line;  // red   — Hr → RSC(q) → Y → y → Y (in-section U-turn)

beforeAll(() => {
  const json = fs.readFileSync(DATA_PATH, 'utf-8');
  state = initState(json);
  lineI = state.getLineHarsh('I' as any);
  lineC = state.getLineHarsh('C' as any);
});

// ── Helpers ────────────────────────────────────────────────────────────────────

function entries(line: Line): DisplayEntry[] {
  return buildDisplayEntries(line.paths);
}

function traversalStationNames(entry: DisplayEntry): string[] {
  if (entry.kind !== 'traversal') throw new Error('not a traversal entry');
  return entry.stations.map(s => s.name);
}

// ── Line I (purple): Hr → RSC(q) → Y → y → P ─────────────────────────────────

describe('line I display entries', () => {
  it('has exactly 3 entries: traversal, RSE, traversal', () => {
    const e = entries(lineI);
    expect(e).toHaveLength(3);
    expect(e[0].kind).toBe('traversal');
    expect(e[1].kind).toBe('rse');
    expect(e[2].kind).toBe('traversal');
  });

  it('first traversal is descending and contains only Hr', () => {
    const e = entries(lineI);
    const t = e[0];
    if (t.kind !== 'traversal') throw new Error();
    expect(t.direction).toBe('descending');
    expect(traversalStationNames(t)).toEqual(['North Station']);
    expect(t.stations[0].inPath).toBe(true);
    expect(t.stations[0].stops).toBe(true);
  });

  it('RSE is not a U-turn and crosses at Central Junction', () => {
    const e = entries(lineI);
    const rse = e[1];
    if (rse.kind !== 'rse') throw new Error();
    expect(rse.isUturn).toBe(false);
    expect(rse.nodeName).toBe('Central Junction');
    expect(rse.exitRoadName).toBe('Central-North');
    expect(rse.enterRoadName).toBe('West-Central');
  });

  it('second traversal is descending and contains Y, y, P in order', () => {
    const e = entries(lineI);
    const t = e[2];
    if (t.kind !== 'traversal') throw new Error();
    expect(t.direction).toBe('descending');
    expect(traversalStationNames(t)).toEqual(['City Hall West', 'Central Station', 'West Station']);
  });

  it('all stations in second traversal are in-path stopping stops', () => {
    const e = entries(lineI);
    const t = e[2];
    if (t.kind !== 'traversal') throw new Error();
    for (const s of t.stations) {
      expect(s.inPath).toBe(true);
      expect(s.stops).toBe(true);
      expect(s.pathIndex).toBeGreaterThanOrEqual(0);
    }
  });

  it('second traversal pathIndices are in descending spatial order', () => {
    const e = entries(lineI);
    const t = e[2];
    if (t.kind !== 'traversal') throw new Error();
    // Y→y→P: pathIndex 2, 3, 4
    expect(t.stations.map(s => s.pathIndex)).toEqual([2, 3, 4]);
  });
});

// ── Line C (red): Hr → RSC(q) → Y → y → Y ────────────────────────────────────
// validateLinePaths produces [Hr(desc,0), RSC(1), Y(desc,2), y(asc,3), Y(asc,4)].
// No pass-throughs: RSC enters road I from side=1 (tEntry=1→tExit=0.7184),
// so P(0.2) and y(0.5) lie outside that span.
//
// The Y→y direction change is a virtual U-turn (no RSC). buildDisplayEntries splits
// the post-RSC group into:
//   traversal(desc): [Y(stop), y(greyed)] — range extended to y's si via look-ahead
//   virtual-uturn
//   traversal(asc):  [y(stop), Y(stop)]   — prevLastSortedIdx=Y's si anchors lo

describe('line C display entries', () => {
  it('has exactly 5 entries: traversal, RSE, traversal(desc), virtual-uturn, traversal(asc)', () => {
    const e = entries(lineC);
    expect(e).toHaveLength(5);
    expect(e[0].kind).toBe('traversal');
    expect(e[1].kind).toBe('rse');
    expect(e[2].kind).toBe('traversal');
    expect(e[3].kind).toBe('virtual-uturn');
    expect(e[4].kind).toBe('traversal');
  });

  it('first traversal contains only Hr (descending)', () => {
    const e = entries(lineC);
    const t = e[0];
    if (t.kind !== 'traversal') throw new Error();
    expect(t.direction).toBe('descending');
    expect(traversalStationNames(t)).toEqual(['North Station']);
    expect(t.stations[0].inPath).toBe(true);
  });

  it('RSE is not a U-turn and crosses at Central Junction', () => {
    const e = entries(lineC);
    const rse = e[1];
    if (rse.kind !== 'rse') throw new Error();
    expect(rse.isUturn).toBe(false);
    expect(rse.nodeName).toBe('Central Junction');
  });

  // After the junction RSC, Y is the only descending stop. The virtual-uturn look-ahead
  // extends the range down to y's si, showing y as a greyed pass-through (the line
  // physically passes through y going down to the reversal point).
  it('second traversal is descending and shows Y(stop) then y(greyed pass-through)', () => {
    const e = entries(lineC);
    const t = e[2];
    if (t.kind !== 'traversal') throw new Error();
    expect(t.direction).toBe('descending');
    expect(traversalStationNames(t)).toEqual(['City Hall West', 'Central Station']);
    const Y = t.stations[0];
    const y = t.stations[1];
    expect(Y.inPath).toBe(true);
    expect(Y.stops).toBe(true);
    expect(Y.pathIndex).toBe(2);
    expect(y.inPath).toBe(false);  // greyed — not a stop in this direction
    expect(y.stops).toBe(false);
    expect(y.pathIndex).toBe(-1);
  });

  // After the virtual U-turn, prevLastSortedIdx=Y's si=2. The ascending segment's
  // range is [min(2,1)=1, lastSi=2] = [y, Y], both are stopping stops.
  it('ascending traversal shows y(stop) then Y(stop)', () => {
    const e = entries(lineC);
    const t = e[4];
    if (t.kind !== 'traversal') throw new Error();
    expect(t.direction).toBe('ascending');
    expect(traversalStationNames(t)).toEqual(['Central Station', 'City Hall West']);
    const y = t.stations[0];
    const Y = t.stations[1];
    expect(y.inPath).toBe(true);
    expect(y.stops).toBe(true);
    expect(y.pathIndex).toBe(3);
    expect(Y.inPath).toBe(true);
    expect(Y.stops).toBe(true);
    expect(Y.pathIndex).toBe(4);
  });
});
