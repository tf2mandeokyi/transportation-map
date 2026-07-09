import { Line, Road, RoadSection, RoadSectionChange, Station, StationStop } from "../../models/structures";
import { CubicBezierPoints } from "../../utils/bezier";
import { PathBuilder } from "../../utils/path";
import { OffsetT } from "../../utils/offset-t";
import { appendJunctionCurve, computeBoundaryPoint, computeCrossingSeg, computeSectionSegs, computeTotalOffset } from "./segment-path";

// Indices (0-based, into the n+1 traversals implied by rseBetween — see buildTraversals)
// of traversals whose geometry is fabricated: the RSE chain doesn't actually
// connect through them, so a road section is missing between two crossings even
// though RSEs exist on both sides of the gap. Traversal j spans boundary[j] to
// boundary[j+1], where boundary[0] is the start station, boundary[n+1] is the end
// station, and boundary[k] for 1<=k<=n is rseBetween[k-1].node.
function findBreaks(
  startSection: RoadSection,
  rseBetween: RoadSectionChange[],
  endSection: RoadSection,
): Set<number> {
  const breaks = new Set<number>();
  let currentSection: RoadSection | null = startSection;
  rseBetween.forEach((rsc, i) => {
    if (currentSection !== null && rsc.exiting && rsc.exiting.section !== currentSection) breaks.add(i);
    currentSection = rsc.entering ? rsc.entering.section : null;
  });
  if (currentSection !== null && currentSection !== endSection) breaks.add(rseBetween.length);
  return breaks;
}

export function isInvalidJump(
  startStation: Station,
  endStation: Station,
  rseBetween: RoadSectionChange[],
): boolean {
  const startSection = startStation.parentRoadSection;
  const endSection   = endStation.parentRoadSection;

  if (rseBetween.length === 0) {
    // No crossing recorded — only valid if it's a same-road, cross-section hop
    // (handled by buildSegmentPath's single crossing segment).
    return startSection.parentRoad !== endSection.parentRoad;
  }

  return findBreaks(startSection, rseBetween, endSection).size > 0;
}

// ── Traversal builder ─────────────────────────────────────────────────────────

type RoadTraversal = {
  road: Road;
  section: RoadSection | null;
  entryT: OffsetT;
  exitT: OffsetT;
  offsetDep: number;
  offsetArr: number;
};

function buildTraversals(
  line: Line,
  rseBetween: RoadSectionChange[],
  startStop: StationStop,
  startGroupIndex: number,
  startStopIndex: number,
  endStop: StationStop,
  endGroupIndex: number,
  endStopIndex: number,
): RoadTraversal[] {
  const startStation = startStop.station;
  const endStation   = endStop.station;
  const startSection = startStation.parentRoadSection;
  const endSection   = endStation.parentRoadSection;
  const startRoad    = startSection.parentRoad;
  const startT       = startStop.end().offset;
  const endT         = endStop.start().offset;

  const traversals: RoadTraversal[] = [];

  const firstRsc = rseBetween[0];
  traversals.push({
    road: startRoad,
    section: startSection,
    entryT: startT,
    exitT: firstRsc.node === startRoad.endpoints[1].node ? new OffsetT(1, 'negative') : new OffsetT(0, 'positive'),
    offsetDep: computeTotalOffset(line, startSection, startStation, startGroupIndex, startStopIndex),
    offsetArr: computeTotalOffset(line, startSection, undefined, undefined, undefined, firstRsc.exitRank),
  });

  for (let k = 0; k < rseBetween.length - 1; k++) {
    const rsc     = rseBetween[k];
    const nextRsc = rseBetween[k + 1];
    if (!rsc.entering) return traversals;
    const road    = rsc.entering.section.parentRoad;
    const section = rsc.entering.section;
    traversals.push({
      road,
      section,
      entryT: rsc.node === road.endpoints[0].node ? new OffsetT(0, 'positive') : new OffsetT(1, 'negative'),
      exitT:  nextRsc.node === road.endpoints[1].node ? new OffsetT(1, 'negative') : new OffsetT(0, 'positive'),
      offsetDep: computeTotalOffset(line, section, undefined, undefined, undefined, rsc.enterRank),
      offsetArr: computeTotalOffset(line, section, undefined, undefined, undefined, nextRsc.exitRank),
    });
  }

  const lastRsc = rseBetween[rseBetween.length - 1];
  if (!lastRsc.entering) return traversals;
  const lastRoad = lastRsc.entering.section.parentRoad;
  // For a U-turn RSC (same section on both sides), use the arrival stop's rank at the
  // turning point — the RSC's enterRank defaults to 0 and doesn't reflect the return lane.
  const isUTurnRsc = lastRsc.exiting !== null && lastRsc.exiting.section === lastRsc.entering.section;
  traversals.push({
    road: lastRoad,
    section: endSection,
    entryT: lastRsc.node === lastRoad.endpoints[0].node ? new OffsetT(0, 'positive') : new OffsetT(1, 'negative'),
    exitT: endT,
    offsetDep: computeTotalOffset(line, endSection, undefined, undefined, undefined, isUTurnRsc ? endStop.rank : lastRsc.enterRank),
    offsetArr: computeTotalOffset(line, endSection, endStation, endGroupIndex, endStopIndex),
  });

  return traversals;
}

function chainBezierEntries(entries: CubicBezierPoints[][]): string {
  const pb = new PathBuilder().beziers(entries[0]);
  for (let i = 1; i < entries.length; i++) {
    const prev = entries[i - 1];
    const curr = entries[i];
    appendJunctionCurve(pb, prev[prev.length - 1], curr[0]);
    for (const { p1, p2, p3 } of curr) pb.cubicTo(p1, p2, p3);
  }
  return pb.build();
}

export function buildSegmentPath(
  line: Line,
  startStop: StationStop,
  startGroupIndex: number,
  startStopIndex: number,
  endStop: StationStop,
  endGroupIndex: number,
  endStopIndex: number,
  rseBetween: RoadSectionChange[],
  headCanvas: Vector,
  tailCanvas: Vector,
): string {
  const startStation = startStop.station;
  const endStation   = endStop.station;
  const startSection = startStation.parentRoadSection;
  const endSection   = endStation.parentRoadSection;
  const startRoad    = startSection.parentRoad;
  const startT       = startStop.end().offset;
  const endT         = endStop.start().offset;
  const fallback = new PathBuilder().moveTo(headCanvas).lineTo(tailCanvas).build();

  if (startStation === endStation) {
    const centerline = startRoad.computeBezier();
    if (!centerline) return fallback;
    const tangent = centerline.evalTangent(startStop.start().offset);
    const tlen = Math.hypot(tangent.x, tangent.y);
    if (tlen < 0.001) return fallback;
    const chord = Math.hypot(tailCanvas.x - headCanvas.x, tailCanvas.y - headCanvas.y);
    const ux = tangent.x / tlen;
    const uy = tangent.y / tlen;
    const p1 = { x: headCanvas.x + ux * chord, y: headCanvas.y + uy * chord };
    const p2 = { x: tailCanvas.x + ux * chord, y: tailCanvas.y + uy * chord };
    return new PathBuilder().moveTo(headCanvas).cubicTo(p1, p2, tailCanvas).build();
  }

  const depRankOverride = !startStop.stops ? startStop.rank : undefined;
  const arrRankOverride = !endStop.stops   ? endStop.rank   : undefined;

  if (rseBetween.length === 0) {
    if (startSection === endSection) {
      const offsetDep = computeTotalOffset(line, startSection, startStation, startGroupIndex, startStopIndex, depRankOverride);
      const offsetArr = computeTotalOffset(line, endSection,   endStation,   endGroupIndex,   endStopIndex,   arrRankOverride);
      const segs = computeSectionSegs(startRoad, startT, endT, offsetDep, offsetArr);
      return segs.length === 0 ? fallback : new PathBuilder().beziers(segs).build();
    }
    // Different sections on the same road — single crossing segment.
    const centerline = startRoad.computeBezier();
    if (!centerline) return fallback;
    const offsetDep = computeTotalOffset(line, startSection, startStation, startGroupIndex, startStopIndex, depRankOverride);
    const offsetArr = computeTotalOffset(line, endSection,   endStation,   endGroupIndex,   endStopIndex,   arrRankOverride);
    const seg = computeCrossingSeg(centerline, startT, endT, offsetDep, offsetArr);
    return new PathBuilder().beziers([seg]).build();
  }

  // Multi-road path.
  const traversals = buildTraversals(line, rseBetween, startStop, startGroupIndex, startStopIndex, endStop, endGroupIndex, endStopIndex);
  const entries: CubicBezierPoints[][] = [];
  for (const tr of traversals) {
    if (tr.section === null) continue;
    const segs = computeSectionSegs(tr.road, tr.entryT, tr.exitT, tr.offsetDep, tr.offsetArr);
    if (segs.length > 0) entries.push(segs);
  }

  return entries.length === 0 ? fallback : chainBezierEntries(entries);
}

// ── Segment pieces (handles breaks in the RSE chain) ──────────────────────────

export type SegmentPiece =
  | { kind: 'normal'; path: string }
  | { kind: 'dashed'; from: Vector; to: Vector };

// Builds the solid/dashed pieces for a station-to-station segment. When the RSE
// chain is fully continuous this is just the one solid piece from buildSegmentPath.
// When it's broken, each valid stretch is rendered solid and each break is a
// dashed jump straight between the two nodes where the chain actually splits —
// not a single dashed line from station to station.
export function buildSegmentPieces(
  line: Line,
  startStop: StationStop,
  startGroupIndex: number,
  startStopIndex: number,
  endStop: StationStop,
  endGroupIndex: number,
  endStopIndex: number,
  rseBetween: RoadSectionChange[],
  headCanvas: Vector,
  tailCanvas: Vector,
): SegmentPiece[] {
  const startStation = startStop.station;
  const endStation   = endStop.station;
  const startSection = startStation.parentRoadSection;
  const endSection   = endStation.parentRoadSection;

  if (rseBetween.length === 0) {
    // No crossing recorded at all — only routable if it's a same-road hop
    // (buildSegmentPath handles that); otherwise there's nothing to jump through.
    if (startSection.parentRoad !== endSection.parentRoad) {
      return [{ kind: 'dashed', from: headCanvas, to: tailCanvas }];
    }
    return [{ kind: 'normal', path: buildSegmentPath(
      line, startStop, startGroupIndex, startStopIndex, endStop, endGroupIndex, endStopIndex,
      rseBetween, headCanvas, tailCanvas,
    ) }];
  }

  const breaks = findBreaks(startSection, rseBetween, endSection);
  if (breaks.size === 0) {
    return [{ kind: 'normal', path: buildSegmentPath(
      line, startStop, startGroupIndex, startStopIndex, endStop, endGroupIndex, endStopIndex,
      rseBetween, headCanvas, tailCanvas,
    ) }];
  }

  const traversals = buildTraversals(line, rseBetween, startStop, startGroupIndex, startStopIndex, endStop, endGroupIndex, endStopIndex);

  // Where the solid piece just before/after traversal j actually terminates —
  // matches buildTraversals' own offsetDep/offsetArr conventions: a traversal
  // starts at the ENTERING-side offset of the previous RSC and ends at the
  // EXITING-side offset of the next RSC (the two sides can land at different
  // points even at the same node, same as the junction curve between two valid
  // traversals bridges). So the dash's "from" must match the preceding solid
  // piece's own end (exiting side of rseBetween[j-1]) and its "to" must match
  // the following solid piece's own start (entering side of rseBetween[j]).
  // Computed via computeBoundaryPoint (matches computeSectionSegs' own
  // convention) rather than RoadSectionChange.computeStartPosition/EndPosition,
  // whose sign flips for side-1 nodes and doesn't match actual line geometry —
  // see computeBoundaryPoint's doc comment. Falls back to the raw node position
  // if the RSC is missing the corresponding side.
  const traversalStart = (j: number): Vector => {
    if (j === 0) return headCanvas;
    const rsc = rseBetween[j - 1];
    if (!rsc.exiting) return rsc.node.position;
    const offset = computeTotalOffset(line, rsc.exiting.section, undefined, undefined, undefined, rsc.exitRank);
    return computeBoundaryPoint(rsc.exiting.section, rsc.exiting.side, offset) ?? rsc.node.position;
  };
  const traversalEnd = (j: number): Vector => {
    if (j === rseBetween.length) return tailCanvas;
    const rsc = rseBetween[j];
    if (!rsc.entering) return rsc.node.position;
    const offset = computeTotalOffset(line, rsc.entering.section, undefined, undefined, undefined, rsc.enterRank);
    return computeBoundaryPoint(rsc.entering.section, rsc.entering.side, offset) ?? rsc.node.position;
  };

  const pieces: SegmentPiece[] = [];
  let run: CubicBezierPoints[][] = [];
  const flushRun = () => {
    if (run.length > 0) pieces.push({ kind: 'normal', path: chainBezierEntries(run) });
    run = [];
  };

  traversals.forEach((tr, j) => {
    if (breaks.has(j)) {
      flushRun();
      pieces.push({ kind: 'dashed', from: traversalStart(j), to: traversalEnd(j) });
      return;
    }
    if (tr.section === null) return;
    const segs = computeSectionSegs(tr.road, tr.entryT, tr.exitT, tr.offsetDep, tr.offsetArr);
    if (segs.length > 0) run.push(segs);
  });
  flushRun();

  return pieces.length === 0 ? [{ kind: 'dashed', from: headCanvas, to: tailCanvas }] : pieces;
}
