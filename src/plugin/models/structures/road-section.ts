import { RoadSectionId, StationId } from "@/common/types";
import { IModel, Serializable } from './types';
import type { Road } from './road';

export interface SerializedRoadSection {
  i: string;    // id
  n?: string;   // name
  x: number;    // index
  s: string[];  // stationIds
}

export interface RoadSectionProps {
  name?: string;
  index: number;
  stationIds: StationId[];
}

export class RoadSection implements RoadSectionProps, Serializable<SerializedRoadSection> {
  parent: IModel;
  id: RoadSectionId;
  name?: string;
  index: number;
  stationIds: StationId[];

  constructor(parent: IModel, id: RoadSectionId, props: RoadSectionProps) {
    this.parent = parent;
    this.id = id;
    this.name = props.name;
    this.index = props.index;
    this.stationIds = props.stationIds;
  }

  findRoad(): Road | null {
    for (const road of this.parent.getState().roads.values()) {
      if (road.sections.has(this.id)) return road;
    }
    return null;
  }

  serialize(): SerializedRoadSection {
    return { i: this.id, n: this.name, x: this.index, s: this.stationIds };
  }

  static deserialize(ser: SerializedRoadSection, parent: IModel): RoadSection {
    return new RoadSection(parent, ser.i as RoadSectionId, {
      name: ser.n,
      index: ser.x,
      stationIds: (ser.s || []) as StationId[],
    });
  }
}
