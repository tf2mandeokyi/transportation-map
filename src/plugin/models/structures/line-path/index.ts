export * from './base';
export { StationStop } from './station-stop';
export { RoadSectionChange } from './rsc';

import { LinePath, SerializedLinePath } from './base';
import { RoadSectionChange } from './rsc';
import { StationStop } from './station-stop';
import { LinePathData } from '@/common/messages';
import { MapState } from '../map-state';
import { Owned, own } from '@/common/utils/ownership';

export function linePathsFromData(mapState: Readonly<MapState>, data: readonly LinePathData[]): Owned<LinePath>[] {
  return data.map(group => own(LinePath.fromData(mapState, group)));
}

export function linePathsToData(paths: readonly LinePath[]): LinePathData[] {
  return paths.map(path => path.toData());
}

export function linePathsSerialize(paths: readonly LinePath[]): SerializedLinePath[] {
  return paths.map(path => path.serialize());
}

export function linePathsDeserialize(mapState: Readonly<MapState>, sers: readonly SerializedLinePath[]): Owned<LinePath>[] {
  return sers.map(ser => own(LinePath.fromSerialized(mapState, ser)));
}

// Flattens a grouped path list into its constituent entries — one optional
// junction crossing followed by each of its station stops, per group — for
// operations that need to address the line by flat position (the UI's
// pathIndex protocol, lane-stacking rank computation, etc).
export function flattenLinePaths(paths: readonly LinePath[]): (RoadSectionChange | StationStop)[] {
  const result: (RoadSectionChange | StationStop)[] = [];
  for (const group of paths) {
    if (group.fromRoadSectionChange) result.push(group.fromRoadSectionChange);
    result.push(...group.stationStops);
  }
  return result;
}

// Re-groups a flat entry list back into LinePath groups (inverse of flattenLinePaths).
export function regroupLinePaths(entries: readonly (RoadSectionChange | StationStop)[]): LinePath[] {
  const groups: LinePath[] = [];
  let current: LinePath | null = null;
  for (const entry of entries) {
    if (entry instanceof RoadSectionChange) {
      current = new LinePath();
      current.fromRoadSectionChange = entry;
      groups.push(current);
    } else {
      if (!current) {
        current = new LinePath();
        groups.push(current);
      }
      current.stationStops.push(entry);
    }
  }
  return groups;
}
