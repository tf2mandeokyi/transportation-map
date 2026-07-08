import { describe, it, expect } from 'vitest';
import { MapState } from '../models/structures/map-state';
import { Road } from '../models/structures/road';
import { RoadSection } from '../models/structures/road-section';
import { Station } from '../models/structures/station';
import { Node } from '../models/structures/node';
import { Line } from '../models/structures/line';
import { LinePath, RoadSectionChange, StationStop } from '../models/structures/line-path';
import { validateLinePaths } from './line-validator';
import { RoadId, SectionId, StationId, LineId, NodeId } from '@/common/types';

// Builds a single-section road with five stations at fixed positions, with no
// geometry beyond what the validator needs (parentRoadSection + interpT).
function buildSection(state: MapState, positions: Record<string, number>): { section: RoadSection; stations: Record<string, Station> } {
  const road = new Road(state, 'r1' as RoadId);
  state.addRoad(road);

  const section = new RoadSection(state, 's1' as SectionId).applyProps(road, { index: 0 });

  const stations: Record<string, Station> = {};
  for (const [name, interpT] of Object.entries(positions)) {
    const station = new Station(state, name as StationId).applyProps({
      name,
      textAlign: 'left',
      textHAlign: 'left',
      textRotation: 0,
      flipped: false,
      interpT,
      roadSection: section,
    });
    station.setParent(section);
    state.addStation(station);
    stations[name] = station;
  }
  section.stations = Object.values(stations);

  return { section, stations };
}

function buildLine(state: MapState, stops: { station: Station; stops?: boolean }[]): Line {
  const line = new Line(state, 'l1' as LineId).applyProps({
    name: 'Test Line',
    color: '#ff0000',
    isCircular: false,
    paths: [],
    figmaGroupId: null,
  });
  state.addLine(line);

  line.appendStationStop({ stationId: stops[0].station.id, direction: 'ascending', rank: 0, stops: stops[0].stops ?? true });
  for (const { station, stops: doesStop } of stops.slice(1)) {
    const group = line.paths[line.paths.length - 1];
    const entry = new StationStop();
    entry.station = station;
    entry.rank = 0;
    entry.stops = doesStop ?? true;
    entry.direction = 'ascending'; // placeholder — validateLinePaths recomputes this
    group.stationStops.push(entry);
  }
  return line;
}

function summarize(line: Line): { id: string; stops: boolean; direction: string }[] {
  return line.paths.flatMap(g => g.stationStops.map(s => ({ id: s.station.id, stops: s.stops, direction: s.direction })));
}

describe('validateLinePaths — virtual U-turn shadow duplication', () => {
  it('duplicates the pivot station as a pass-through at every direction reversal', () => {
    const state = new MapState();
    const { stations } = buildSection(state, { A: 0.1, B: 0.3, C: 0.5, D: 0.7, E: 0.9 });

    const line = buildLine(state, [
      { station: stations.A },
      { station: stations.B },
      { station: stations.C },
      { station: stations.D },
      { station: stations.C }, // revisit — first U-turn pivot is D
      { station: stations.B }, // revisit — second U-turn pivot is B
      { station: stations.E },
    ]);

    line.paths = validateLinePaths(line);

    expect(summarize(line)).toEqual([
      { id: 'A', stops: true,  direction: 'ascending'  },
      { id: 'B', stops: true,  direction: 'ascending'  },
      { id: 'C', stops: true,  direction: 'ascending'  },
      { id: 'D', stops: true,  direction: 'ascending'  },
      { id: 'D', stops: false, direction: 'descending' }, // shadow of first pivot
      { id: 'C', stops: true,  direction: 'descending'  },
      { id: 'B', stops: true,  direction: 'descending'  },
      { id: 'B', stops: false, direction: 'ascending' }, // shadow of second pivot
      { id: 'C', stops: false, direction: 'ascending' },
      { id: 'D', stops: false, direction: 'ascending' },
      { id: 'E', stops: true,  direction: 'ascending'  },
    ]);
  });

  it('infers the correct initial direction when the first click has a higher interpT than the second', () => {
    const state = new MapState();
    const { stations } = buildSection(state, { A: 0.7, B: 0.3 });

    const line = buildLine(state, [
      { station: stations.A },
      { station: stations.B },
    ]);

    line.paths = validateLinePaths(line);

    expect(summarize(line)).toEqual([
      { id: 'A', stops: true, direction: 'descending' },
      { id: 'B', stops: true, direction: 'descending' },
    ]);
  });

  it('leaves a straight, non-reversing path untouched', () => {
    const state = new MapState();
    const { stations } = buildSection(state, { A: 0.1, B: 0.3, C: 0.5 });

    const line = buildLine(state, [
      { station: stations.A },
      { station: stations.C }, // B lies strictly between A and C but was skipped
    ]);

    line.paths = validateLinePaths(line);

    expect(summarize(line)).toEqual([
      { id: 'A', stops: true,  direction: 'ascending' },
      { id: 'B', stops: false, direction: 'ascending' }, // ordinary gap fill, not a reversal
      { id: 'C', stops: true,  direction: 'ascending' },
    ]);
  });
});

describe('validateLinePaths — trailing RSC with nothing to check', () => {
  it('keeps a freshly-added road crossing into a stationless section instead of dropping it', () => {
    const state = new MapState();
    const { section: emptySection } = buildSection(state, {}); // no stations on this section

    const line = new Line(state, 'l1' as LineId).applyProps({
      name: 'Test Line',
      color: '#ff0000',
      isCircular: false,
      paths: [],
      figmaGroupId: null,
    });
    state.addLine(line);

    const node = new Node(state, 'n1' as NodeId).applyProps({ name: 'N1', position: { x: 0, y: 0 }, radius: 0 });
    state.addNode(node);

    // Mirrors what "Add Road" commits as the very first entry of a brand-new path:
    // exiting is null (nothing to cross from yet), entering is the clicked section.
    const rsc = new RoadSectionChange();
    rsc.node = node;
    rsc.exiting = null;
    rsc.entering = { section: emptySection, side: 0 };
    rsc.exitRank = 0;
    rsc.enterRank = 0;

    const group = new LinePath();
    group.fromRoadSectionChange = rsc;
    line.paths = [group];

    const result = validateLinePaths(line);

    // Previously this trailing group got popped because it had nothing to check
    // (the entered section has zero stations), collapsing the whole path to [].
    expect(result).toHaveLength(1);
    expect(result[0].fromRoadSectionChange).toBe(rsc);
    expect(result[0].stationStops).toEqual([]);
  });
});

describe('validateLinePaths — manual direction override on an ambiguous first stop', () => {
  it('preserves a manually-set direction on a lone first stop with no lookahead reference', () => {
    const state = new MapState();
    const { stations } = buildSection(state, { A: 0.5 });

    const line = buildLine(state, [{ station: stations.A }]);

    // Simulate what Line.setStopDirection does: flip the stored direction, then re-validate.
    line.paths[0].stationStops[0].direction = 'descending';
    line.paths = validateLinePaths(line);

    expect(summarize(line)).toEqual([
      { id: 'A', stops: true, direction: 'descending' },
    ]);

    // Flipping back and re-validating again should stick just the same —
    // this isn't a one-way default, it's a real toggle.
    line.paths[0].stationStops[0].direction = 'ascending';
    line.paths = validateLinePaths(line);

    expect(summarize(line)).toEqual([
      { id: 'A', stops: true, direction: 'ascending' },
    ]);
  });

  it('does NOT preserve a manual override when a same-section lookahead can determine it', () => {
    const state = new MapState();
    const { stations } = buildSection(state, { A: 0.1, B: 0.3 });

    const line = buildLine(state, [
      { station: stations.A },
      { station: stations.B },
    ]);
    line.paths = validateLinePaths(line);

    // Manually force A to 'descending', even though A→B is a real, unambiguous ascending hop.
    line.paths[0].stationStops[0].direction = 'descending';
    line.paths = validateLinePaths(line);

    // The lookahead recomputes it back to 'ascending' — geometry wins when it's known.
    expect(summarize(line)).toEqual([
      { id: 'A', stops: true, direction: 'ascending' },
      { id: 'B', stops: true, direction: 'ascending' },
    ]);
  });

  it('Line.setStopDirection (the method the UI toggle button actually calls) flips and keeps a lone stop\'s direction', () => {
    const state = new MapState();
    const { stations } = buildSection(state, { A: 0.5 });

    const line = buildLine(state, [{ station: stations.A }]);
    line.paths = validateLinePaths(line);
    expect(summarize(line)).toEqual([{ id: 'A', stops: true, direction: 'ascending' }]);

    line.setStopDirection(0, 0, 'descending');
    expect(summarize(line)).toEqual([{ id: 'A', stops: true, direction: 'descending' }]);

    line.setStopDirection(0, 0, 'ascending');
    expect(summarize(line)).toEqual([{ id: 'A', stops: true, direction: 'ascending' }]);
  });
});
