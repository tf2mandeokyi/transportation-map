import { Line, LinePath, MapState, Node, Road, RoadSection, RoadSectionChange, Station, StationStop } from "../models/structures";
import { evalQuadraticBezier, evalQuadraticBezierTangent } from "./bezier";
import { LINE_SPACING, ROAD_MARGIN, ROAD_MIN_WIDTH, SECTION_GAP } from "./constants";
import { getLinesForSection } from "./section";

export function sectionBandWidth(numLines: number): number {
  return numLines <= 0 ? ROAD_MIN_WIDTH : numLines * LINE_SPACING + 2 * ROAD_MARGIN;
}

export function lineOffsetInSection(lineIndex: number, numLines: number): number {
  return (lineIndex - (numLines - 1) / 2) * LINE_SPACING;
}

export function computeSectionOffset(
  section: RoadSection,
  road: Road,
  state: Readonly<MapState>,
): number {
  const sections = Array.from(road.sections.values()).sort((a, b) => a.index - b.index);
  const widths = sections.map(s => sectionBandWidth(getLinesForSection(s, state).length));
  const gapTotal = Math.max(0, sections.length - 1) * SECTION_GAP;
  const totalWidth = widths.reduce((a, b) => a + b, 0) + gapTotal;
  let cumulative = -totalWidth / 2;
  for (let i = 0; i < sections.length; i++) {
    const center = cumulative + widths[i] / 2;
    if (sections[i] === section) return center;
    cumulative += widths[i] + SECTION_GAP;
  }
  return 0;
}

type PathEntry<T extends LinePath> = {
  line: Line;
  path: T;
  rank: number;
  road: Road | null;
  section: RoadSection | null;
};

function computeEntry(line: Line, path: LinePath): PathEntry<LinePath> {
  if (path.kind === 'station-stop') {
    const station = path.station;
    const section = station.roadSection ?? null;
    const road = section?.road ?? null;
    return { line, path, rank: path.rank, road, section };
  }
  const section = path.exiting ?? path.entering;
  const road = section?.road ?? null;
  const rank = path.exiting !== null ? path.exitRank : path.enterRank;
  return { line, path, rank, road, section: section ?? null };
}

function applyLateralOffset(pos: Vector, tan: Vector, offset: number): Vector {
  const len = Math.hypot(tan.x, tan.y) || 1;
  return { x: pos.x + (-tan.y / len) * offset, y: pos.y + (tan.x / len) * offset };
}

function computePosition<T extends LinePath>(entry: PathEntry<T>, state: Readonly<MapState>): Vector {
  const { path, road, section, rank } = entry;
  if (!road || !section) return { x: 0, y: 0 };

  const bezier = road.computeBezier();
  if (!bezier) return { x: 0, y: 0 };

  const numLines = getLinesForSection(section, state).length;
  const totalOffset = computeSectionOffset(section, road, state) + lineOffsetInSection(rank, numLines);

  if (path.kind === 'station-stop') {
    const station = path.station;
    const pos = evalQuadraticBezier(bezier, station.interpT);
    if (totalOffset === 0) return pos;
    return applyLateralOffset(pos, evalQuadraticBezierTangent(bezier, station.interpT), totalOffset);
  }

  const isStart = road.startNode === path.node;
  const ep = road.endpoints[isStart ? 0 : 1].endpointPos;
  if (totalOffset === 0) return ep;
  return applyLateralOffset(ep, evalQuadraticBezierTangent(bezier, isStart ? 0 : 1), totalOffset * (isStart ? 1 : -1));
}

function getLinePaths<T extends LinePath>(
  state: Readonly<MapState>,
  match: (p: LinePath) => p is T,
): Array<{ line: Line; path: T; position: Vector }> {
  const groups = new Map<string | null, PathEntry<T>[]>();
  for (const line of state.lines.values()) {
    for (const p of line.paths) {
      if (!match(p)) continue;
      const e = computeEntry(line, p) as PathEntry<T>;
      const key = e.section?.id ?? null;
      const group = groups.get(key);
      if (group) group.push(e);
      else groups.set(key, [e]);
    }
  }
  const entries: PathEntry<T>[] = [];
  for (const group of groups.values()) {
    group.sort((a, b) => a.rank - b.rank);
    entries.push(...group);
  }
  return entries.map(e => ({ line: e.line, path: e.path, position: computePosition(e, state) }));
}

export function getStationStopsAcrossLines(
  station: Station,
  state: Readonly<MapState>,
): Array<{ line: Line; path: StationStop; position: Vector }> {
  return getLinePaths(state, (p): p is StationStop => p.kind === 'station-stop' && p.station === station);
}

export function getRscEntriesForNode(
  node: Node,
  state: Readonly<MapState>,
): Array<{ line: Line; path: RoadSectionChange; position: Vector }> {
  return getLinePaths(state, (p): p is RoadSectionChange => p.kind === 'road-section-change' && p.node === node);
}
