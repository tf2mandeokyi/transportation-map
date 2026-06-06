import { Node, MapState } from '../models/structures';
import { TRACK_SPACING, ROAD_MIN_WIDTH } from './bezier';
import { getLinesForSection, sectionBandWidth } from './section';
import { PathBuilder } from './path';

interface Arm {
  direction: Vector;  // unit vector pointing INTO the road from this endpoint (away from junction)
  n: Vector;         // perp(direction) — CW-side perpendicular in screen (Y-down) coords
  posEdge: Vector;   // endpoint displaced to the +n (CW) side
  negEdge: Vector;   // endpoint displaced to the -n (CCW) side
}

export class JunctionShape {
  private readonly arms: Arm[];

  constructor(node: Node, state: Readonly<MapState>) {
    const arms: Arm[] = [];

    for (const { roadId, endpointIndex } of node.roadConnections) {
      const road = state.roads.get(roadId);
      if (!road) continue;

      const conn = road.endpoints[endpointIndex];
      const ep: Vector = conn.endpointPos;

      const bDx = conn.bezierPos.x - conn.endpointPos.x;
      const bDy = conn.bezierPos.y - conn.endpointPos.y;
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
        const center = (sections.length - 1) / 2;
        posOff = -Infinity;
        negOff =  Infinity;
        for (const sec of sections) {
          const sc = (sec.index - center) * TRACK_SPACING;
          const numLines = getLinesForSection(sec, state).length;
          const hb = sectionBandWidth(numLines) / 2;
          if (sc + hb > posOff) posOff = sc + hb;
          if (sc - hb < negOff) negOff = sc - hb;
        }
      }

      arms.push({
        direction: dir,
        n,
        posEdge: { x: ep.x + n.x * posOff, y: ep.y + n.y * posOff },
        negEdge: { x: ep.x + n.x * negOff, y: ep.y + n.y * negOff },
      });
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
      JunctionShape.appendGapCurve(
        pb,
        curr.posEdge, { x: -curr.direction.x, y: -curr.direction.y },
        next.negEdge, { x: -next.direction.x, y: -next.direction.y },
      );
    }

    pb.close();
  }

  // Appends the smooth gap curve between two road-edge points.
  // exitDir and entryDir are unit vectors pointing INTO the junction from each edge point.
  //
  // Uses apex-ray intersection (isosceles △ construction):
  //   Both rays fired toward junction meet at apex A.  tNear = min(t, s).
  //   C sits on the far ray at distance tNear from A so |AC| = |AB| = tNear.
  //   Far side: straight line to C.  Near side: bezier from C (C1-continuous with the straight).
  static appendGapCurve(
    pb: PathBuilder,
    exitPos: Vector, exitDir: Vector,
    entryPos: Vector, entryDir: Vector,
  ): void {
    const gx  = entryPos.x - exitPos.x;
    const gy  = entryPos.y - exitPos.y;
    const det = entryDir.x * exitDir.y - exitDir.x * entryDir.y;

    if (Math.abs(det) > 1e-6) {
      const t = (entryDir.x * gy - gx * entryDir.y) / det;
      const s = (exitDir.x  * gy - exitDir.y  * gx) / det;
      if (t >= -1e-6 && s >= -1e-6) {
        const tNear = Math.min(t, s);
        if (t >= s) {
          // exitPos side is far: straight exitPos→C, bezier C→entryPos
          const cx = exitPos.x + (t - tNear) * exitDir.x;
          const cy = exitPos.y + (t - tNear) * exitDir.y;
          const a  = Math.hypot(entryPos.x - cx, entryPos.y - cy) * 0.4;
          pb.lineTo({ x: cx, y: cy });
          pb.cubicTo(
            { x: cx + exitDir.x * a,       y: cy + exitDir.y * a },
            { x: entryPos.x + entryDir.x * a, y: entryPos.y + entryDir.y * a },
            entryPos,
          );
        } else {
          // entryPos side is far: bezier exitPos→C, straight C→entryPos
          const cx = entryPos.x + (s - tNear) * entryDir.x;
          const cy = entryPos.y + (s - tNear) * entryDir.y;
          const a  = Math.hypot(exitPos.x - cx, exitPos.y - cy) * 0.4;
          pb.cubicTo(
            { x: exitPos.x + exitDir.x * a, y: exitPos.y + exitDir.y * a },
            { x: cx + entryDir.x * a,       y: cy + entryDir.y * a },
            { x: cx, y: cy },
          );
          pb.lineTo(entryPos);
        }
        return;
      }
    }

    pb.lineTo(entryPos);
  }
}
