export * from './pass';

import { RoadSectionPass, SerializedRoadSectionPass } from './pass';
import { RoadSectionPassData } from '@/common/messages';
import { MapState } from '../map-state';
import { Owned, own } from '@/common/utils/ownership';

export function linePathsFromData(mapState: Readonly<MapState>, data: readonly RoadSectionPassData[]): Owned<RoadSectionPass>[] {
  return data.map(pass => own(RoadSectionPass.fromData(mapState, pass)));
}

export function linePathsToData(paths: readonly RoadSectionPass[]): RoadSectionPassData[] {
  return paths.map(pass => pass.toData());
}

export function linePathsSerialize(paths: readonly RoadSectionPass[]): SerializedRoadSectionPass[] {
  return paths.map(pass => pass.serialize());
}

export function linePathsDeserialize(mapState: Readonly<MapState>, sers: readonly SerializedRoadSectionPass[]): Owned<RoadSectionPass>[] {
  return sers.map(ser => own(RoadSectionPass.fromSerialized(mapState, ser)));
}
