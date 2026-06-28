import { Line, LinePath, Road, RoadSection } from "../models/structures";
import { lineOffsetInSection } from "./constants";

function applyLateralOffset(pos: Vector, tan: Vector, offset: number): Vector {
  const len = Math.hypot(tan.x, tan.y) || 1;
  return { x: pos.x + (-tan.y / len) * offset, y: pos.y + (tan.x / len) * offset };
}

export class PathEntry<T extends LinePath> {
  line: Line;
  path: T;
  rank: number;
  road: Road | null;
  section: RoadSection | null;

  constructor(line: Line, path: T, rank: number, road: Road | null, section: RoadSection | null) {
    this.line = line;
    this.path = path;
    this.rank = rank;
    this.road = road;
    this.section = section;
  }

  computePosition(): Vector {
    if (!this.road || !this.section) return { x: 0, y: 0 };

    const bezier = this.road.computeBezier();
    if (!bezier) return { x: 0, y: 0 };

    const numLines = this.section.getMaxStationStopCount();

    if (this.path.kind === 'station-stop') {
        const station = this.path.station;
        // A single directed pass can stop at the same station more than once (loop lines).
        // Mirror computeTotalOffset: effectiveCount = max(numLines, rank + 1) so that a rank
        // which exceeds the directed-pass count still maps to a valid slot.
        const effectiveCount = Math.max(numLines, this.rank + 1);
        const totalOffset = this.section.computeOffset() + lineOffsetInSection(this.rank, effectiveCount);
        const pos = bezier.eval(station.interpT);
        if (totalOffset === 0) return pos;
        return applyLateralOffset(pos, bezier.evalTangent(station.interpT), totalOffset);
    }

    const totalOffset = this.section.computeOffset() + lineOffsetInSection(this.rank, numLines);
    const isStart = this.road.endpoints[0].node === this.path.node;
    const ep = this.road.endpoints[isStart ? 0 : 1].endpointPos;
    if (totalOffset === 0) return ep;
    return applyLateralOffset(ep, bezier.evalTangent(isStart ? 0 : 1), totalOffset * (isStart ? 1 : -1));
    }
};