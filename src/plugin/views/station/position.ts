import { MapState, RoadSection } from "../../models/structures";
import { Station } from "../../models/structures/station";
import { computeSectionOffset } from "../../utils/line-queries";
import { evalQuadraticBezier, evalQuadraticBezierTangent } from "../../utils/bezier";

export function computeStationPosition(station: Station, state: Readonly<MapState>): Vector {
  const section = station.parentRoadSection as RoadSection | undefined;
  if (!section) return { x: 0, y: 0 };
  const road = section.parentRoad;

  const base = road.computeBezier();
  if (!base) return { x: 0, y: 0 };

  const offset = computeSectionOffset(section, road, state);

  const pos = evalQuadraticBezier(base, station.interpT);
  if (offset === 0) return pos;

  const tangent = evalQuadraticBezierTangent(base, station.interpT);
  const len = Math.hypot(tangent.x, tangent.y);
  if (len < 0.001) return pos;
  return { x: pos.x + (-tangent.y / len) * offset, y: pos.y + (tangent.x / len) * offset };
}

export function computeStationTangentAngle(station: Station): number {
  const section = station.parentRoadSection as RoadSection | undefined;
  if (!section) return 0;
  const road = section.parentRoad;

  const base = road.computeBezier();
  if (!base) return 0;

  const tangent = evalQuadraticBezierTangent(base, station.interpT);
  return Math.atan2(tangent.y, tangent.x) * 180 / Math.PI;
}
