import { LinePathData, LinePathStationStopData } from '@/common/messages';

type LinePathRscFields = Pick<LinePathData, 'fromNodeId' | 'entering' | 'exiting'>;

function bareGroup(stationStops: LinePathStationStopData[]): LinePathData {
  return { fromNodeId: undefined, entering: null, exiting: null, stationStops };
}

// Rebuilds a group with new station stops, preserving its RSC fields (if any).
function withStationStops(g: LinePathData, stationStops: LinePathStationStopData[]): LinePathData {
  return { fromNodeId: g.fromNodeId, entering: g.entering, exiting: g.exiting, stationStops };
}

// Addresses a position within a grouped LinePathData[] list: a specific group's
// RSC (stopIndex -1) or one of its station stops (stopIndex >= 0).
export interface LinePathAddress {
  groupIndex: number;
  stopIndex: number;
}

// Sentinel meaning "before the first group" — used as an insertion point.
export const START_ADDRESS: LinePathAddress = { groupIndex: -1, stopIndex: -1 };

export function isStartAddress(addr: LinePathAddress): boolean {
  return addr.groupIndex < 0;
}

export interface FlatLinePathItem {
  flatIndex: number;
  groupIndex: number;
  stopIndex: number;
  kind: 'rsc' | 'station-stop';
  rsc?: LinePathRscFields;
  stop?: LinePathStationStopData;
}

// Recovers the flat, ordered view of a grouped path list. flatIndex is a
// display-only sequence number (used for React keys / numbering); the
// canonical address for plugin round-trips is (groupIndex, stopIndex).
export function flattenLinePathData(groups: readonly LinePathData[]): FlatLinePathItem[] {
  const flat: FlatLinePathItem[] = [];
  let flatIndex = 0;
  groups.forEach((g, groupIndex) => {
    if (g.fromNodeId !== undefined) {
      flat.push({ flatIndex: flatIndex++, groupIndex, stopIndex: -1, kind: 'rsc', rsc: { fromNodeId: g.fromNodeId, entering: g.entering, exiting: g.exiting } });
    }
    g.stationStops.forEach((stop, stopIndex) => {
      flat.push({ flatIndex: flatIndex++, groupIndex, stopIndex, kind: 'station-stop', stop });
    });
  });
  return flat;
}

export function lastAddress(groups: readonly LinePathData[]): LinePathAddress {
  const flat = flattenLinePathData(groups);
  const last = flat[flat.length - 1];
  return last ? { groupIndex: last.groupIndex, stopIndex: last.stopIndex } : START_ADDRESS;
}

// The address of an item inserted immediately after `after`, so a chain of
// inserts can be threaded through in the right order.
export function insertedAddress(after: LinePathAddress): LinePathAddress {
  return isStartAddress(after)
    ? { groupIndex: 0, stopIndex: 0 }
    : { groupIndex: after.groupIndex, stopIndex: after.stopIndex + 1 };
}

export function insertStationStopAfter(
  groups: readonly LinePathData[],
  after: LinePathAddress,
  stop: LinePathStationStopData,
): LinePathData[] {
  if (isStartAddress(after)) {
    if (groups.length > 0 && groups[0].fromNodeId === undefined) {
      return [withStationStops(groups[0], [stop, ...groups[0].stationStops]), ...groups.slice(1)];
    }
    return [bareGroup([stop]), ...groups];
  }
  return groups.map((g, gi) => {
    if (gi !== after.groupIndex) return g;
    const insertAt = after.stopIndex + 1;
    return withStationStops(g, [...g.stationStops.slice(0, insertAt), stop, ...g.stationStops.slice(insertAt)]);
  });
}

// Inserts newGroups right after `after`, splitting the addressed group's
// trailing station stops into a fresh run following the inserted groups —
// each RSC always starts a new group boundary.
export function insertGroupsAfter(
  groups: readonly LinePathData[],
  after: LinePathAddress,
  newGroups: readonly LinePathData[],
): LinePathData[] {
  if (isStartAddress(after)) return [...newGroups, ...groups];

  const result: LinePathData[] = [];
  groups.forEach((g, gi) => {
    if (gi !== after.groupIndex) { result.push(g); return; }

    const splitAt = after.stopIndex + 1;
    result.push(withStationStops(g, g.stationStops.slice(0, splitAt)));
    result.push(...newGroups);

    const tail = g.stationStops.slice(splitAt);
    if (tail.length > 0) {
      const idx = result.length - 1;
      result[idx] = withStationStops(result[idx], [...result[idx].stationStops, ...tail]);
    }
  });
  return result;
}

// Removes a group's RSC while keeping its trailing station stops, merging them
// into the preceding group (or a new leading bare group if it was the first).
export function removeRsc(groups: readonly LinePathData[], groupIndex: number): LinePathData[] {
  const target = groups[groupIndex];
  if (!target) return [...groups];

  const result = groups.filter((_, gi) => gi !== groupIndex);
  if (target.stationStops.length === 0) return result;

  if (groupIndex === 0) return [bareGroup(target.stationStops), ...result];

  const mergeIdx = groupIndex - 1;
  result[mergeIdx] = withStationStops(result[mergeIdx], [...result[mergeIdx].stationStops, ...target.stationStops]);
  return result;
}
