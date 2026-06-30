import { HVAlign, StationId } from "@/common/types";
import { TransportationMapObject } from './types';
import type { RoadSection } from './road-section';
import { StationStop } from "./line-path";
import { Line } from "./line";
import { own, Owned } from "@/common/utils/ownership";
import { OffsetT } from "@/plugin/utils/offset-t";

export interface SerializedStation {
  n: string;                        // name
  f: string | null;                 // figmaNodeId
  t: HVAlign;                       // textAlign
  h?: 'left' | 'center' | 'right';  // textHAlign (absent → 'left')
  r?: number;                       // textRotation (absent → 0)
  l?: boolean;                      // flipped (absent → false)
  p: number;                        // interpT
}

export interface StationProps {
  name: string;
  textAlign: HVAlign;
  textHAlign: 'left' | 'center' | 'right';
  textRotation: number;
  flipped: boolean;
  interpT: number;
  roadSection: RoadSection | null;
}

export class Station extends TransportationMapObject<StationId> {
  name!: string;
  figmaNodeId: string | null = null;
  textAlign!: HVAlign;
  textHAlign!: 'left' | 'center' | 'right';
  textRotation!: number;
  flipped!: boolean;
  private _interpT!: number;
  get interpT(): OffsetT { return new OffsetT(this._interpT, 'zero'); }
  parentRoadSection!: RoadSection;

  applyProps(props: StationProps): this {
    this.name = props.name;
    this.textAlign = props.textAlign;
    this.textHAlign = props.textHAlign;
    this.textRotation = props.textRotation;
    this.flipped = props.flipped;
    this._interpT = props.interpT;
    return this;
  }

  applySerialized(ser: SerializedStation): this {
    this.name = ser.n;
    this.textAlign = ser.t;
    this.textHAlign = ser.h ?? 'left';
    this.textRotation = ser.r ?? 0;
    this.flipped = ser.l ?? false;
    this._interpT = ser.p;
    return this;
  }

  setParent(roadSection: RoadSection): void {
    this.parentRoadSection = roadSection;
  }

  createCopyProps(): StationProps {
    return {
      name: this.name,
      textAlign: this.textAlign,
      textHAlign: this.textHAlign,
      textRotation: this.textRotation,
      flipped: this.flipped,
      interpT: this._interpT,
      roadSection: this.parentRoadSection,
    };
  }

  makePassThroughStop(rank: number, direction: 'ascending' | 'descending'): Owned<StationStop> {
    const ss = new StationStop(this.mapState);
    ss.station = this;
    ss.rank = rank;
    ss.stops = false;
    ss.direction = direction;
    return own(ss);
  }

  serialize(): SerializedStation {
    return {
      n: this.name,
      f: this.figmaNodeId,
      t: this.textAlign,
      h: this.textHAlign,
      r: this.textRotation || undefined,
      l: this.flipped || undefined,
      p: this._interpT,
    };
  }

  getLineStackingRanks(): Array<{ line: Line; pathIndex: number; rank: number, stops: boolean }> {
    const stops: Array<{ path: StationStop; line: Line; pathIndex: number; rank: number, stops: boolean }> = [];
    for (const line of this.mapState.getLines()) {
      for (const [index, p] of line.paths.entries()) {
        if (p instanceof StationStop && p.station === this) {
          stops.push({ path: p, line, pathIndex: index, rank: p.rank, stops: p.stops });
        }
      }
    }
    stops.sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      if (a.line.id !== b.line.id) return a.line.id < b.line.id ? -1 : 1;
      return a.pathIndex - b.pathIndex;
    });
    stops.forEach(({ path }, i) => { path.rank = i; });
    return stops.map(({ line, pathIndex, rank, stops }) => ({ line, pathIndex, rank, stops  }));
  }

  getStopsAcrossLines(): Array<{ line: Line; path: StationStop; position: Vector }> {
    return this.mapState.getLinePaths((p): p is StationStop => p instanceof StationStop && p.station === this);
  }

  computePosition(): Vector {
    const section = this.parentRoadSection;
    if (!section) return { x: 0, y: 0 };
    const road = section.parentRoad;

    const base = road.computeBezier();
    if (!base) return { x: 0, y: 0 };

    const offset = section.computeOffset();

    const pos = base.eval(this._interpT);
    if (offset === 0) return pos;

    const tangent = base.evalTangent(this.interpT);
    const len = Math.hypot(tangent.x, tangent.y);
    if (len < 0.001) return pos;
    return { x: pos.x + (-tangent.y / len) * offset, y: pos.y + (tangent.x / len) * offset };
  }

  updateStopRanks(stops: Array<{ line: Line; pathIndex: number; rank: number }>): void {
    for (const { line, pathIndex, rank } of stops) {
      const path = line.paths[pathIndex];
      if (path instanceof StationStop && path.station === this) {
        path.rank = rank;
      }
    }
  }
}
