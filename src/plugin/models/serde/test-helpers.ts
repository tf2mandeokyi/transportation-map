import * as path from 'path';
import { MapState } from '../structures/map-state';
import { deserializeMapState } from './index';
import { validateLinePaths } from '../../utils/line-validator';
import { RoadSection } from '../structures/road-section';
import { RoadSectionChange } from '../structures/line-path';

export const DATA_PATH = path.resolve(__dirname, '../../../../tmp/data.json');

export function initState(json: string): MapState {
  const s = new MapState();
  if (!deserializeMapState(json, s)) throw new Error('Failed to deserialize');
  for (const line of s.getLines()) line.paths = validateLinePaths(line);
  s.normalize();
  for (const line of s.getLines()) line.paths = validateLinePaths(line);
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
    for (const p of line.paths) {
      if (!(p instanceof RoadSectionChange)) continue;
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

