import { Line, LinePath, MapState, Road, StationStop } from "../models/structures";
import { NodeId } from "@/common/types";
import { findRoadForSection } from "./section";

function findSharedNode(roadA: Road, roadB: Road): NodeId | null {
  if (roadA.endNodeId === roadB.startNodeId || roadA.endNodeId === roadB.endNodeId) return roadA.endNodeId;
  if (roadA.startNodeId === roadB.startNodeId || roadA.startNodeId === roadB.endNodeId) return roadA.startNodeId;
  return null;
}

// Rebuilds the RSE entries for a line so that every transition between station
// stops on different roads has exactly one RoadSectionEnter. Existing RSEs are
// stripped and regenerated from road topology (direct single-hop junctions only).
export function validateLinePaths(line: Line, state: Readonly<MapState>): LinePath[] {
  const stops = line.paths.filter((p): p is StationStop => p.kind === 'station-stop');
  const result: LinePath[] = [];

  for (let i = 0; i < stops.length; i++) {
    if (i > 0) {
      const prevStation = state.stations.get(stops[i - 1].stationId);
      const currStation = state.stations.get(stops[i].stationId);
      if (prevStation && currStation) {
        const prevRoad = prevStation.roadSectionId ? findRoadForSection(prevStation.roadSectionId, state) : null;
        const currRoad = currStation.roadSectionId ? findRoadForSection(currStation.roadSectionId, state) : null;
        if (prevRoad && currRoad && prevRoad.id !== currRoad.id) {
          const nodeId = findSharedNode(prevRoad, currRoad);
          if (nodeId) {
            result.push({
              kind: 'road-section-enter',
              index: 0,
              sourceRoadId: prevRoad.id,
              nodeId,
              destRoadId: currRoad.id,
            });
          }
        }
      }
    }
    result.push(stops[i]);
  }

  return result.map((p, i) => ({ ...p, index: i }));
}
