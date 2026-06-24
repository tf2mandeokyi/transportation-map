import { RoadSectionId } from "@/common/types";
import { IModel, Serializable } from './types';
import type { Road } from './road';
import type { Station } from './station';

export interface SerializedRoadSection {
  i: string;    // id
  n?: string;   // name
  x: number;    // index
  s: string[];  // stationIds
}

export interface RoadSectionProps {
  name?: string;
  index: number;
}

export class RoadSection implements Serializable<SerializedRoadSection> {
  parent: IModel;
  id: RoadSectionId;
  name?: string;
  index: number;
  stations: Station[] = [];
  road!: Road;

  constructor(parent: IModel, id: RoadSectionId, props: RoadSectionProps) {
    this.parent = parent;
    this.id = id;
    this.name = props.name;
    this.index = props.index;
  }

  findRoad(): Road {
    return this.road;
  }

  serialize(): SerializedRoadSection {
    return { i: this.id, n: this.name, x: this.index, s: this.stations.map(s => s.id) };
  }

  resolve(road: Road): void {
    this.road = road;
  }

  static deserialize(ser: SerializedRoadSection, parent: IModel): RoadSection {
    return new RoadSection(parent, ser.i as RoadSectionId, { name: ser.n, index: ser.x });
  }
}
