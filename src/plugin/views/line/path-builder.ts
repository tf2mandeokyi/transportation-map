import { Line, PassStop, Road, RoadSection, RoadSectionPass, Station } from "../../models/structures";
import { CubicBezierPoints } from "../../utils/bezier";
import { PathBuilder } from "../../utils/path";
import { OffsetT } from "../../utils/offset-t";
import { appendJunctionCurve, computeSectionSegs, computeTotalOffset } from "./segment-path";

function depOffset(station: Station, direction: 'ascending' | 'descending'): OffsetT {
  return station.interpT.withBias(direction === 'ascending' ? 'positive' : 'negative');
}

function arrOffset(station: Station, direction: 'ascending' | 'descending'): OffsetT {
  return station.interpT.withBias(direction === 'ascending' ? 'negative' : 'positive');
}

// Passes strictly between startPass and endPass, in travel order — line.paths.slice
// (startPassIndex+1, endPassIndex). Empty when the two stops share a pass or sit on
// directly adjacent passes.
export function isInvalidJump(
  startPass: RoadSectionPass,
  passesBetween: RoadSectionPass[],
  endPass: RoadSectionPass,
): boolean {
  const chain = [startPass, ...passesBetween, endPass];
  for (let i = 0; i < chain.length - 1; i++) {
    if (chain[i].toNode !== chain[i + 1].fromNode) return true;
  }
  return false;
}

// ── Traversal builder ─────────────────────────────────────────────────────────
// Every entry of `chain` (built from startPass/passesBetween/endPass) is already
// one full RoadSectionPass, so it maps 1:1 onto one RoadTraversal — no more
// indirection between "crossings" and "road stretches" the way the old RSC chain
// needed.

type RoadTraversal = {
  road: Road;
  section: RoadSection;
  entryT: OffsetT;
  exitT: OffsetT;
  offsetDep: number;
  offsetArr: number;
};

function buildTraversals(
  line: Line,
  chain: RoadSectionPass[],
  startStation: Station, startPassIndex: number,
  endStation: Station, endPassIndex: number,
): RoadTraversal[] {
  return chain.map((pass, j) => {
    const isFirst = j === 0;
    const isLast = j === chain.length - 1;

    const entryT = isFirst ? depOffset(startStation, pass.direction) : pass.start().offset;
    const exitT = isLast ? arrOffset(endStation, pass.direction) : pass.end().offset;

    const offsetDep = isFirst
      ? computeTotalOffset(line, pass.section, startStation, startPassIndex)
      : computeTotalOffset(line, pass.section, undefined, undefined, pass.fromRank);
    const offsetArr = isLast
      ? computeTotalOffset(line, pass.section, endStation, endPassIndex)
      : computeTotalOffset(line, pass.section, undefined, undefined, pass.toRank);

    return { road: pass.section.parentRoad, section: pass.section, entryT, exitT, offsetDep, offsetArr };
  });
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
  startStop: PassStop, startPass: RoadSectionPass, startPassIndex: number,
  endStop: PassStop, endPass: RoadSectionPass, endPassIndex: number,
  passesBetween: RoadSectionPass[],
  headCanvas: Vector,
  tailCanvas: Vector,
): string {
  const startStation = startStop.station;
  const endStation = endStop.station;
  const fallback = new PathBuilder().moveTo(headCanvas).lineTo(tailCanvas).build();

  if (startStation === endStation) {
    const centerline = startPass.section.parentRoad.computeBezier();
    if (!centerline) return fallback;
    const tangent = centerline.evalTangent(arrOffset(startStation, startPass.direction));
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

  if (startPass === endPass) {
    const offsetDep = computeTotalOffset(line, startPass.section, startStation, startPassIndex, depRankOverride);
    const offsetArr = computeTotalOffset(line, endPass.section, endStation, endPassIndex, arrRankOverride);
    const segs = computeSectionSegs(startPass.section.parentRoad, depOffset(startStation, startPass.direction), arrOffset(endStation, endPass.direction), offsetDep, offsetArr);
    return segs.length === 0 ? fallback : new PathBuilder().beziers(segs).build();
  }

  const chain = [startPass, ...passesBetween, endPass];
  const traversals = buildTraversals(line, chain, startStation, startPassIndex, endStation, endPassIndex);
  const entries: CubicBezierPoints[][] = [];
  for (const tr of traversals) {
    const segs = computeSectionSegs(tr.road, tr.entryT, tr.exitT, tr.offsetDep, tr.offsetArr);
    if (segs.length > 0) entries.push(segs);
  }

  return entries.length === 0 ? fallback : chainBezierEntries(entries);
}

// ── Segment pieces (handles gaps in the pass chain) ────────────────────────────

export type SegmentPiece =
  | { kind: 'normal'; path: string }
  | { kind: 'dashed'; from: Vector; to: Vector };

// Builds the solid/dashed pieces for a station-to-station segment. Every pass in
// the chain is independently valid (it's real, validated data), so unlike the old
// RSC-chain version, no traversal geometry is ever discarded — a gap only means the
// JUNCTION CURVE between two adjacent passes is unreliable, so that one junction is
// drawn as a straight dashed line between the two real (but disconnected) endpoints
// instead of a smooth curve, and the run is split there.
export function buildSegmentPieces(
  line: Line,
  startStop: PassStop, startPass: RoadSectionPass, startPassIndex: number,
  endStop: PassStop, endPass: RoadSectionPass, endPassIndex: number,
  passesBetween: RoadSectionPass[],
  headCanvas: Vector,
  tailCanvas: Vector,
): SegmentPiece[] {
  const startStation = startStop.station;
  const endStation = endStop.station;

  if (startPass === endPass) {
    return [{ kind: 'normal', path: buildSegmentPath(
      line, startStop, startPass, startPassIndex, endStop, endPass, endPassIndex,
      passesBetween, headCanvas, tailCanvas,
    ) }];
  }

  const chain = [startPass, ...passesBetween, endPass];
  const traversals = buildTraversals(line, chain, startStation, startPassIndex, endStation, endPassIndex);

  const pieces: SegmentPiece[] = [];
  let run: CubicBezierPoints[][] = [];
  const flushRun = () => {
    if (run.length > 0) pieces.push({ kind: 'normal', path: chainBezierEntries(run) });
    run = [];
  };

  chain.forEach((pass, j) => {
    if (j > 0 && chain[j - 1].toNode !== pass.fromNode) {
      flushRun();
      const from = chain[j - 1].computeToPosition() ?? chain[j - 1].toNode.position;
      const to = pass.computeFromPosition() ?? pass.fromNode.position;
      pieces.push({ kind: 'dashed', from, to });
    }
    const tr = traversals[j];
    const segs = computeSectionSegs(tr.road, tr.entryT, tr.exitT, tr.offsetDep, tr.offsetArr);
    if (segs.length > 0) run.push(segs);
  });
  flushRun();

  return pieces.length === 0 ? [{ kind: 'dashed', from: headCanvas, to: tailCanvas }] : pieces;
}
