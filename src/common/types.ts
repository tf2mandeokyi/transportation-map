// Defines the direction a node is "facing" for line stacking
export type StationOrientation = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

// Using branded types to prevent mixing up different kinds of IDs
export type StationId = string & { readonly __brand: 'NodeId' };
export type LineId = string & { readonly __brand: 'LineId' };
export type LineSegmentId = string & { readonly __brand: 'LineSegmentId' };

export function createLineSegmentId(lineId: LineId, startStationId: StationId, endStationId: StationId): LineSegmentId {
  return `${lineId}:${startStationId}-${endStationId}` as LineSegmentId;
}
