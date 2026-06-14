import { Line, LinePath, MapState, Road, StationStop } from "../models/structures";
import { NodeId } from "@/common/types";
import { findRoadForSection } from "./section";

function findSharedNode(roadA: Road, roadB: Road): NodeId | null {
  if (roadA.endNodeId === roadB.startNodeId || roadA.endNodeId === roadB.endNodeId) return roadA.endNodeId;
  if (roadA.startNodeId === roadB.startNodeId || roadA.startNodeId === roadB.endNodeId) return roadA.startNodeId;
  return null;
}

// Validates and normalises RSE entries for a line:
// - Preserves manually-placed RSEs between consecutive stops (multi-hop support).
// - Auto-inserts a single RSE between consecutive stops on different directly-connected
//   roads when no RSE is already present between them.
// - Strips leading RSEs (before the first stop) and trailing RSEs (after the last stop).
export function validateLinePaths(line: Line, state: Readonly<MapState>): LinePath[] {
  const result: LinePath[] = [];
  let prevStopResultIdx = -1;

  for (const p of line.paths) {
    if (p.kind === 'road-section-enter') {
      // Discard RSEs that appear before the first stop.
      if (prevStopResultIdx >= 0) result.push(p);
    } else {
      // Auto-insert RSE only when no RSE already exists between the previous stop and here.
      if (prevStopResultIdx >= 0 && result.length === prevStopResultIdx + 1) {
        const prevStop = result[prevStopResultIdx] as StationStop;
        const prevStation = state.stations.get(prevStop.stationId);
        const currStation = state.stations.get(p.stationId);
        if (prevStation && currStation) {
          const prevRoad = prevStation.roadSectionId ? findRoadForSection(prevStation.roadSectionId, state) : null;
          const currRoad = currStation.roadSectionId ? findRoadForSection(currStation.roadSectionId, state) : null;
          if (prevRoad && currRoad && prevRoad.id !== currRoad.id) {
            const nodeId = findSharedNode(prevRoad, currRoad);
            if (nodeId) {
              result.push({ kind: 'road-section-enter', index: 0, sourceRoadId: prevRoad.id, nodeId, destRoadId: currRoad.id });
            }
          }
        }
      }
      prevStopResultIdx = result.length;
      result.push(p);
    }
  }

  // Strip trailing RSEs after the last stop.
  while (result.length > 0 && result[result.length - 1].kind !== 'station-stop') result.pop();

  return result.map((p, i) => ({ ...p, index: i }));
}
