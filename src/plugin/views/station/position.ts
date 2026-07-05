import { RoadSection } from "../../models/structures";
import { Station } from "../../models/structures/station";


export function computeStationTangentAngle(station: Station): number {
  const section = station.parentRoadSection as RoadSection | undefined;
  if (!section) return 0;
  const road = section.parentRoad;

  const base = road.computeBezier();
  if (!base) return 0;

  const tangent = base.evalTangent(station.interpT);
  return Math.atan2(tangent.y, tangent.x) * 180 / Math.PI;
}
