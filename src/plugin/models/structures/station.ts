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

export interface StationProps {
  name: string;
  figmaNodeId: string | null;
  textAlign: HVAlign;
  textHAlign: 'left' | 'center' | 'right';
  textRotation: number;
  flipped: boolean;
  interpT: number;
  roadSectionId: RoadSectionId | null;
}

export class Station implements StationProps, Serializable<SerializedStation> {
  parent: IModel;
  id: StationId;
  name: string;
  figmaNodeId: string | null;
  textAlign: HVAlign;
  textHAlign: 'left' | 'center' | 'right';
  textRotation: number;
  flipped: boolean;
  interpT: number;
  roadSectionId: RoadSectionId | null;

  constructor(parent: IModel, id: StationId, props: StationProps) {
    this.parent = parent;
    this.id = id;
    this.name = props.name;
    this.figmaNodeId = props.figmaNodeId;
    this.textAlign = props.textAlign;
    this.textHAlign = props.textHAlign;
    this.textRotation = props.textRotation;
    this.flipped = props.flipped;
    this.interpT = props.interpT;
    this.roadSectionId = props.roadSectionId;
  }

  getRoad(): Road | null {
    if (!this.roadSectionId) return null;
    for (const road of this.parent.getState().roads.values()) {
      if (road.sections.has(this.roadSectionId)) return road;
    }
    return null;
  }

  getRoadSection(): RoadSection | null {
    if (!this.roadSectionId) return null;
    return this.getRoad()?.sections.get(this.roadSectionId) ?? null;
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
      s: this.roadSectionId,
    };
  }

  static deserialize(ser: SerializedStation, parent: IModel): Station {
    const id = ser.i as StationId;
    return new Station(parent, id, {
      name: ser.n,
      figmaNodeId: ser.f,
      textAlign: ser.t,
      textHAlign: ser.h ?? 'left',
      textRotation: ser.r ?? 0,
      flipped: ser.l ?? false,
      interpT: ser.p,
      roadSectionId: ser.s as RoadSectionId | null
    });
  }
}
