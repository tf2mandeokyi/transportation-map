import { LineId, RoadId, RoadSectionId, StationId } from "@/common/types";
import { PluginToUIMessage } from "@/common/messages";
import { linePathsToData } from "../models/structures";
import { MapState } from "../models/structures/map-state";
import { buildDisplayEntries } from "./display-entries";

type LinePathDataMessage = Extract<PluginToUIMessage, { type: 'line-path-data' }>;

// Pure computation behind the 'get-line-path' response — no figma/postMessage
// dependency, so both the real plugin controller and the dev UI harness's fake
// backend can share it.
export function getLinePathData(state: Readonly<MapState>, lineId: LineId): Omit<LinePathDataMessage, 'type'> | null {
  const line = state.getLine(lineId);
  if (!line) return null;

  const stationNames: Record<StationId, string> = {};
  const stationRoadIds: Record<StationId, RoadId | null> = {};
  const stationSectionIds: Record<StationId, RoadSectionId | null> = {};

  for (const pass of line.paths) {
    for (const stop of pass.stops) {
      const station = stop.station;
      stationNames[station.id] = station.name;
      stationRoadIds[station.id] = station.parentRoadSection?.parentRoad?.id ?? null;
      stationSectionIds[station.id] = station.parentRoadSection?.getRoadSectionId() ?? null;
    }
  }

  return {
    lineId,
    paths: linePathsToData(line.paths),
    stationNames,
    stationRoadIds,
    stationSectionIds,
    displayEntries: buildDisplayEntries(line.paths),
  };
}
