import { MapState, Station } from "../../models/structures";
import { computeRoadBezier, findRoadForSection } from "../../utils/section";
import { evalQuadraticBezier, evalQuadraticBezierTangent, TRACK_SPACING } from "../../utils/bezier";

export function computeStationPosition(station: Station, state: Readonly<MapState>): Vector {
  if (!station.roadSectionId) return { x: 0, y: 0 };
  const road = findRoadForSection(station.roadSectionId, state);
  if (!road) return { x: 0, y: 0 };

  const base = computeRoadBezier(road, state);
  if (!base) return { x: 0, y: 0 };

  const section = road.sections.get(station.roadSectionId);
  if (!section) return { x: 0, y: 0 };

  const sections = Array.from(road.sections.values());
  const center = (sections.length - 1) / 2;
  const offset = (section.index - center) * TRACK_SPACING;

  const pos = evalQuadraticBezier(base, station.interpT);
  if (offset === 0) return pos;

  const tangent = evalQuadraticBezierTangent(base, station.interpT);
  const len = Math.hypot(tangent.x, tangent.y);
  if (len < 0.001) return pos;
  return { x: pos.x + (-tangent.y / len) * offset, y: pos.y + (tangent.x / len) * offset };
}

export function computeStationTangentAngle(station: Station, state: Readonly<MapState>): number {
  if (!station.roadSectionId) return 0;
  const road = findRoadForSection(station.roadSectionId, state);
  if (!road) return 0;

  const base = computeRoadBezier(road, state);
  if (!base) return 0;

  const tangent = evalQuadraticBezierTangent(base, station.interpT);
  return Math.atan2(tangent.y, tangent.x) * 180 / Math.PI;
}
