export * from './base';
export { StationStop } from './station-stop';
export { RoadSectionChange } from './rsc';

import { LinePath, SerializedLinePath } from './base';
import { StationStop } from './station-stop';
import { RoadSectionChange } from './rsc';
import { LinePathData } from '@/common/messages';
import { MapState } from '../map-state';
import { Owned, own } from '@/common/utils/ownership';

export function linePathFromData(mapState: Readonly<MapState>, input: LinePathData): Owned<LinePath> {
  if (input.kind === 'station-stop') return own(new StationStop(mapState).applyData(input));
  return own(new RoadSectionChange(mapState).applyData(input));
}

export function linePathDeserialize(mapState: Readonly<MapState>, ser: SerializedLinePath): Owned<LinePath> {
  if (ser.k === 'ss') return own(new StationStop(mapState).applySerialized(ser));
  return own(new RoadSectionChange(mapState).applySerialized(ser));
}