import { HVAlign, RoadSectionId, StationId } from "@/common/types";
import { IModel, Serializable } from './types';
import type { Road } from './road';
import type { RoadSection } from './road-section';

export interface SerializedStation {
  i: string;                        // id
  n: string;                        // name
  f: string | null;                 // figmaNodeId
  t: HVAlign;                       // textAlign
  h?: 'left' | 'center' | 'right'; // textHAlign (absent → 'left')
  r?: number;                       // textRotation (absent → 0)
  l?: boolean;                      // flipped (absent → false)
  p: number;                        // interpT
  s: string | null;                 // roadSectionId
}

export interface StationCoreProps {
  name: string;
  textAlign: HVAlign;
  textHAlign: 'left' | 'center' | 'right';
  textRotation: number;
  flipped: boolean;
  interpT: number;
}

export interface StationProps extends StationCoreProps {
  roadSectionId: RoadSectionId | null;
}

export class Station implements Serializable<SerializedStation> {
  parent: IModel;
  id: StationId;
  name: string;
  figmaNodeId: string | null = null;
  textAlign: HVAlign;
  textHAlign: 'left' | 'center' | 'right';
  textRotation: number;
  flipped: boolean;
  interpT: number;
  roadSection: RoadSection | null = null;
  private _roadSectionId: RoadSectionId | null = null;

  constructor(parent: IModel, id: StationId, props: StationCoreProps) {
    this.parent = parent;
    this.id = id;
    this.name = props.name;
    this.textAlign = props.textAlign;
    this.textHAlign = props.textHAlign;
    this.textRotation = props.textRotation;
    this.flipped = props.flipped;
    this.interpT = props.interpT;
  }

  getRoad(): Road | null {
    return this.roadSection?.road ?? null;
  }

  getRoadSection(): RoadSection | null {
    return this.roadSection;
  }

  serialize(): SerializedStation {
    return {
      i: this.id,
      n: this.name,
      f: this.figmaNodeId,
      t: this.textAlign,
      h: this.textHAlign,
      r: this.textRotation || undefined,
      l: this.flipped || undefined,
      p: this.interpT,
      s: this.roadSection?.id ?? null,
    };
  }

  resolve(sections: Map<RoadSectionId, RoadSection>): void {
    if (!this._roadSectionId) return;
    const section = sections.get(this._roadSectionId);
    if (section) {
      this.roadSection = section;
      section.stations.push(this);
    }
  }

  static deserialize(ser: SerializedStation, parent: IModel): Station {
    const station = new Station(parent, ser.i as StationId, {
      name: ser.n,
      textAlign: ser.t,
      textHAlign: ser.h ?? 'left',
      textRotation: ser.r ?? 0,
      flipped: ser.l ?? false,
      interpT: ser.p,
    });
    station.figmaNodeId = ser.f;
    station._roadSectionId = (ser.s as RoadSectionId) ?? null;
    return station;
  }
}
