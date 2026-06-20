import { PathBuilder } from './path';

// Appends the smooth gap curve between two road-edge points.
// exitDir and entryDir are unit vectors pointing INTO the junction from each edge point.
//
// Uses apex-ray intersection (isosceles △ construction):
//   Both rays fired toward junction meet at apex A.  tNear = min(t, s).
//   C sits on the far ray at distance tNear from A so |AC| = |AB| = tNear.
//   Far side: straight line to C.  Near side: bezier from C (C1-continuous with the straight).
export function appendGapCurve(
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
          { x: cx + exitDir.x * a,          y: cy + exitDir.y * a },
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

  const dist = Math.hypot(gx, gy) / 3;
  pb.cubicTo(
    { x: exitPos.x + exitDir.x * dist, y: exitPos.y + exitDir.y * dist },
    { x: entryPos.x + entryDir.x * dist, y: entryPos.y + entryDir.y * dist },
    entryPos,
  );
}
