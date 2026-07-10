import * as path from 'path';
import * as fs from 'fs';
import { MapState } from '../structures/map-state';
import { deserializeMapState } from './index';
import { validateLinePaths } from '../../utils/line-validator';
import { RoadSection } from '../structures/road-section';

export const DATA_PATH = path.resolve(__dirname, '../../../../tmp/data.json');
export const fixtureExists = fs.existsSync(DATA_PATH);

export function initState(json: string): MapState {
  const s = new MapState();
  if (!deserializeMapState(json, s)) throw new Error('Failed to deserialize');
  for (const line of s.getLines()) line.paths = validateLinePaths(line);
  s.normalize();
  return s;
}

export type SectionSideKey = string;

export function sideKey(section: RoadSection, side: 0 | 1): SectionSideKey {
  return `${section.parentRoad.id}:${section.id}:${side}`;
}

// enterRanks = every pass's own fromRank at (section, side-of-fromNode); exitRanks =
// every pass's own toRank at (section, side-of-toNode) — the same two numbers a
// RoadSectionChange used to carry as entering.rank/exiting.rank, just relocated onto
// the pass that actually owns each boundary instead of a separate crossing object.
export function collectPassRanks(state: MapState): Map<SectionSideKey, { enterRanks: number[]; exitRanks: number[] }> {
  const map = new Map<SectionSideKey, { enterRanks: number[]; exitRanks: number[] }>();

  const getOrCreate = (k: SectionSideKey) => {
    let v = map.get(k);
    if (!v) { v = { enterRanks: [], exitRanks: [] }; map.set(k, v); }
    return v;
  };

  for (const line of state.getLines()) {
    for (const pass of line.paths) {
      const fromSide: 0 | 1 = pass.direction === 'ascending' ? 0 : 1;
      const toSide: 0 | 1 = fromSide === 0 ? 1 : 0;
      getOrCreate(sideKey(pass.section, fromSide)).enterRanks.push(pass.fromRank);
      getOrCreate(sideKey(pass.section, toSide)).exitRanks.push(pass.toRank);
    }
  }

  return map;
}

export function applyOffset(pos: { x: number; y: number }, tan: { x: number; y: number }, offset: number) {
  const len = Math.hypot(tan.x, tan.y) || 1;
  return { x: pos.x + (-tan.y / len) * offset, y: pos.y + (tan.x / len) * offset };
}
