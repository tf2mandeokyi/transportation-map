import { Node, MapState } from '../models/structures';
import { RoadId } from '@/common/types';
import { ROAD_MIN_WIDTH } from './constants';
import { getLinesForSection } from './section';
import { sectionBandWidth, computeSectionOffset } from './line-queries';
import { PathBuilder } from './path';
import { appendGapCurve } from './curves';

interface Arm {
  direction: Vector;  // unit vector pointing INTO the road from this endpoint (away from junction)
  n: Vector;         // perp(direction) — CW-side perpendicular in screen (Y-down) coords
  posEdge: Vector;   // endpoint displaced to the +n (CW) side
  negEdge: Vector;   // endpoint displaced to the -n (CCW) side
}

function buildArm(roadId: RoadId, endpointIndex: 0 | 1, state: Readonly<MapState>): Arm | null {
  const road = state.roads.get(roadId);
  if (!road) return null;

  const conn = road.endpoints[endpointIndex];
  const ep: Vector = conn.endpointPos;

  const bDx = road.bezierMidPoint.x - ep.x;
  const bDy = road.bezierMidPoint.y - ep.y;
  const bLen = Math.hypot(bDx, bDy);
  const dir: Vector = bLen < 0.001
    ? { x: 1, y: 0 }
    : { x: bDx / bLen, y: bDy / bLen };

  // perp(dir) rotates 90° CW in screen coords (Y-down)
  const n: Vector = { x: -dir.y, y: dir.x };

  const sections = Array.from(road.sections.values()).sort((a, b) => a.index - b.index);
  let posOff: number;
  let negOff: number;

  if (sections.length === 0) {
    posOff =  ROAD_MIN_WIDTH / 2;
    negOff = -ROAD_MIN_WIDTH / 2;
  } else {
    posOff = -Infinity;
    negOff =  Infinity;
    for (const sec of sections) {
      const sc = computeSectionOffset(sec, road, state);
      const numLines = getLinesForSection(sec, state).length;
      const hb = sectionBandWidth(numLines) / 2;
      if (sc + hb > posOff) posOff = sc + hb;
      if (sc - hb < negOff) negOff = sc - hb;
    }
  }

  return {
    direction: dir,
    n,
    posEdge: { x: ep.x + n.x * posOff, y: ep.y + n.y * posOff },
    negEdge: { x: ep.x + n.x * negOff, y: ep.y + n.y * negOff },
  };
}

export class JunctionShape {
  private readonly arms: Arm[];

  constructor(node: Node, state: Readonly<MapState>) {
    const arms: Arm[] = [];

    for (const { road, endpointIndex } of node.roadConnections) {
      const arm = buildArm(road.id, endpointIndex, state);
      if (arm) arms.push(arm);
    }

    // Sort arms CW in screen coords: ascending atan2(direction.y, direction.x)
    arms.sort((a, b) =>
      Math.atan2(a.direction.y, a.direction.x) - Math.atan2(b.direction.y, b.direction.x),
    );

    this.arms = arms;
  }

  get isValid(): boolean {
    return this.arms.length >= 2;
  }

  // Writes the closed junction polygon into pb.
  // For each arm: line across its road face (negEdge → posEdge),
  // then a smooth gap curve to the next arm's negEdge.
  drawPolygon(pb: PathBuilder): void {
    if (!this.isValid) return;

    pb.moveTo(this.arms[0].negEdge);

    for (let i = 0; i < this.arms.length; i++) {
      const curr = this.arms[i];
      const next = this.arms[(i + 1) % this.arms.length];

      pb.lineTo(curr.posEdge);

      // Inward directions: -direction flips from "into road" to "into junction"
      appendGapCurve(
        pb,
        curr.posEdge, { x: -curr.direction.x, y: -curr.direction.y },
        next.negEdge, { x: -next.direction.x, y: -next.direction.y },
      );
    }

    pb.close();
  }

}
