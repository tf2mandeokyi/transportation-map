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

export function collectRscRanks(state: MapState): Map<SectionSideKey, { enterRanks: number[]; exitRanks: number[] }> {
  const map = new Map<SectionSideKey, { enterRanks: number[]; exitRanks: number[] }>();

  const getOrCreate = (k: SectionSideKey) => {
    let v = map.get(k);
    if (!v) { v = { enterRanks: [], exitRanks: [] }; map.set(k, v); }
    return v;
  };

  for (const line of state.getLines()) {
    for (const group of line.paths) {
      const p = group.fromRoadSectionChange;
      if (!p) continue;
      if (p.entering) {
        getOrCreate(sideKey(p.entering.section, p.entering.side)).enterRanks.push(p.enterRank);
      }
      if (p.exiting) {
        getOrCreate(sideKey(p.exiting.section, p.exiting.side)).exitRanks.push(p.exitRank);
      }
    }
  }

  return map;
}

export function applyOffset(pos: { x: number; y: number }, tan: { x: number; y: number }, offset: number) {
  const len = Math.hypot(tan.x, tan.y) || 1;
  return { x: pos.x + (-tan.y / len) * offset, y: pos.y + (tan.x / len) * offset };
}

