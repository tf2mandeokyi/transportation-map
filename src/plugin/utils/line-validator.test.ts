import { describe, it, expect } from 'vitest';
import { MapState } from '../models/structures/map-state';
import { Road } from '../models/structures/road';
import { RoadSection } from '../models/structures/road-section';
import { Station } from '../models/structures/station';
import { Line } from '../models/structures/line';
import { StationStop } from '../models/structures/line-path';
import { validateLinePaths } from './line-validator';
import { RoadId, SectionId, StationId, LineId } from '@/common/types';

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
