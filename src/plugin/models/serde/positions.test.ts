import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'node:fs';
import { MapState } from '../structures/map-state';
import { RoadSection } from '../structures/road-section';
import { computeTotalOffset } from '../../views/line/segment-path';
import { DATA_PATH, fixtureExists, initState, applyOffset } from './test-helpers';
import { lineOffsetInSection } from '@/plugin/utils/constants';

let state: MapState;

beforeAll(() => {
  if (!fixtureExists) return;
  const json = fs.readFileSync(DATA_PATH, 'utf-8');
  state = initState(json);
});

// ── Position consistency ──────────────────────────────────────────────────────
// For each StationStop and RoadSectionChange, the position derived from the
// stored rank must equal the position the renderer derives from
// getLinesForSection / computeTotalOffset. A mismatch means the station dot
// and the line segment endpoint are visually disconnected.

describe.skipIf(!fixtureExists)('line end positions match station/RSC positions', () => {
  it('station stop: rank-based position matches pass-index-based position', () => {
    for (const line of state.getLines()) {
      for (const [groupIndex, group] of line.paths.entries()) {
        for (const [stopIndex, p] of group.stationStops.entries()) {
          const section = p.station.parentRoadSection;
          const road = section.parentRoad;
          const bezier = road.computeBezier();
          if (!bezier) continue;

          const pos = p.station.interpT.evalBezier(bezier);
          const tan = p.station.interpT.evalBezierTangent(bezier);

          const totalSlots = section.getMaxStationStopCount();
          const effectiveCount = Math.max(totalSlots, p.rank + 1);
          const offsetA = section.computeOffset() + lineOffsetInSection(p.rank, effectiveCount);
          const posA = applyOffset(pos, tan, offsetA);

          const offsetB = computeTotalOffset(line, section, p.station, groupIndex, stopIndex);
          const posB = applyOffset(pos, tan, offsetB);

          const label = `line "${line.id}" stop "${p.station.id}"`;
          expect(posA.x, `${label} x`).toBeCloseTo(posB.x, 3);
          expect(posA.y, `${label} y`).toBeCloseTo(posB.y, 3);
        }
      }
    }
  });

  it('RSC rank positions: rank-based and force-rank positions agree', () => {
    for (const line of state.getLines()) {
      for (const group of line.paths) {
        const p = group.fromRoadSectionChange;
        if (!p) continue;

        const sides = [
          p.exiting  ? { section: p.exiting.section,  rank: p.exitRank,  label: 'exit'  } : null,
          p.entering ? { section: p.entering.section, rank: p.enterRank, label: 'enter' } : null,
        ].filter((x): x is { section: RoadSection; rank: number; label: string } => x !== null);

        for (const { section, rank, label: side } of sides) {
          const road = section.parentRoad;
          const bezier = road.computeBezier();
          if (!bezier) continue;

          const isStart = road.endpoints[0].node === p.node;
          const ep = road.computeEndpointPos(isStart ? 0 : 1);
          const tan = bezier.evalTangent(isStart ? 0 : 1);
          const sign = isStart ? 1 : -1;

          const totalSlots = section.getMaxStationStopCount();
          const effectiveCount = Math.max(totalSlots, rank + 1);
          const offsetA = section.computeOffset() + lineOffsetInSection(rank, effectiveCount);
          const posA = applyOffset(ep, tan, offsetA * sign);

          const offsetB = computeTotalOffset(line, section, undefined, undefined, undefined, rank);
          const posB = applyOffset(ep, tan, offsetB * sign);

          const label = `line "${line.id}" RSC at node "${p.node.id}" ${side} rank ${rank}`;
          expect(posA.x, `${label} x`).toBeCloseTo(posB.x, 3);
          expect(posA.y, `${label} y`).toBeCloseTo(posB.y, 3);
        }
      }
    }
  });
});

// ── Overlap checks ────────────────────────────────────────────────────────────
// No two line endpoint positions should coincide at the same station or junction.
// A collision means a rank-assignment bug caused two lines to render on top of
// each other even though the compact-rank tests above only verify integer order.

const OVERLAP_THRESHOLD = 0.01;

describe.skipIf(!fixtureExists)('no overlapping line end positions', () => {
  it('no two lines share the same end position at a station', () => {
    for (const station of state.getStations()) {
      const entries = station.getStopsAcrossLines();
      for (let i = 0; i < entries.length; i++) {
        for (let j = i + 1; j < entries.length; j++) {
          const a = entries[i].position;
          const b = entries[j].position;
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          expect(
            dist,
            `station "${station.id}": lines "${entries[i].line.id}" and "${entries[j].line.id}" overlap (dist=${dist.toFixed(4)})`
          ).toBeGreaterThan(OVERLAP_THRESHOLD);
        }
      }
    }
  });

  it('no two lines share the same end position at a junction', () => {
    for (const node of state.getNodes()) {
      const entries = node.getRscEntries();
      for (let i = 0; i < entries.length; i++) {
        for (let j = i + 1; j < entries.length; j++) {
          const a = entries[i].position;
          const b = entries[j].position;
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          expect(
            dist,
            `node "${node.id}": lines "${entries[i].line.id}" and "${entries[j].line.id}" overlap (dist=${dist.toFixed(4)})`
          ).toBeGreaterThan(OVERLAP_THRESHOLD);
        }
      }
    }
  });
});
