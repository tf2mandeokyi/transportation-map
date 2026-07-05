import { HVAlign, StationId } from "@/common/types";
import { LineAtStationData } from "@/common/messages";
import { TransportationMapObject } from './types';
import type { RoadSection, LinePass } from './road-section';
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
  get rawInterpT(): number { return this._interpT; }
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

  setInterpT(t: number): void {
    this._interpT = t;
  }

  // Bounds this station may move within along its road section's shared bezier param,
  // exclusive of its immediate neighbors (or the section's 0/1 ends when there is none),
  // so stations can never cross past each other or reorder within the section.
  getMovableRange(): { min: number; max: number } {
    const section = this.parentRoadSection;
    if (!section) return { min: 0, max: 1 };
    const sorted = [...section.stations].sort((a, b) => a._interpT - b._interpT);
    const index = sorted.indexOf(this);
    const min = index > 0 ? sorted[index - 1]._interpT : 0;
    const max = index < sorted.length - 1 ? sorted[index + 1]._interpT : 1;
    return { min, max };
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

  // Builds a stop at this station traveling in `direction`. `stops` defaults to true
  // (a real, user-authored stop); pass-throughs are built via makePassThroughStop.
  generateStop(direction: 'ascending' | 'descending', rank = 0, stops = true): Owned<StationStop> {
    const ss = new StationStop();
    ss.station = this;
    ss.rank = rank;
    ss.stops = stops;
    ss.direction = direction;
    return own(ss);
  }

  makePassThroughStop(rank: number, direction: 'ascending' | 'descending'): Owned<StationStop> {
    return this.generateStop(direction, rank, false);
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

  // Returns one LinePass per occurrence of this station in any line's path (real stop
  // or pass-through shadow), sorted by rank so lane ordering is consistent with station
  // stop ordering.
  getLinePasses(): LinePass[] {
    const passes: Array<LinePass & { rank: number }> = [];
    for (const line of this.mapState.getLines()) {
      for (const [groupIndex, group] of line.paths.entries()) {
        for (const [stopIndex, p] of group.stationStops.entries()) {
          if (p.station === this) {
            passes.push({ line, groupIndex, stopIndex, rank: p.rank, stops: p.stops });
          }
        }
      }
    }
    passes.sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      return a.line.id < b.line.id ? -1 : 1;
    });
    return passes;
  }

  // Collects every stop this line makes at this station, normalizes their ranks to a
  // dense 0..n-1 stacking order (breaking ties deterministically), and drops stops that
  // can't currently be positioned (e.g. incomplete road data).
  getStopsAcrossLines(): Array<{ line: Line; groupIndex: number; stopIndex: number; rank: number; stops: boolean; facing: 'left' | 'right'; position: Vector }> {
    const entries: Array<{ path: StationStop; line: Line; groupIndex: number; stopIndex: number }> = [];
    for (const line of this.mapState.getLines()) {
      for (const [groupIndex, group] of line.paths.entries()) {
        for (const [stopIndex, path] of group.stationStops.entries()) {
          if (path.station === this) entries.push({ path, line, groupIndex, stopIndex });
        }
      }
    }

    entries.sort((a, b) =>
      (a.path.rank - b.path.rank)
      || (a.line.id < b.line.id ? -1 : a.line.id > b.line.id ? 1 : 0)
      || (a.groupIndex - b.groupIndex)
      || (a.stopIndex - b.stopIndex)
    );
    entries.forEach(({ path }, rank) => { path.rank = rank; });

    const result: Array<{ line: Line; groupIndex: number; stopIndex: number; rank: number; stops: boolean; facing: 'left' | 'right'; position: Vector }> = [];
    for (const { path, line, groupIndex, stopIndex } of entries) {
      const position = path.computePosition();
      if (!position) continue;
      const facing: 'left' | 'right' = path.direction === 'ascending' ? 'right' : 'left';
      result.push({ line, groupIndex, stopIndex, rank: path.rank, stops: path.stops, facing, position });
    }
    return result;
  }

  getLinesAtStationData(): LineAtStationData[] {
    return this.getStopsAcrossLines().map(({ line, groupIndex, stopIndex, rank, stops, facing }) => ({
      id: line.id, name: line.name, color: line.color, groupIndex, stopIndex, rank, facing, stops,
    }));
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

  updateStopRanks(stops: Array<{ line: Line; groupIndex: number; stopIndex: number; rank: number }>): void {
    for (const { line, groupIndex, stopIndex, rank } of stops) {
      const path = line.paths[groupIndex]?.stationStops[stopIndex];
      if (path && path.station === this) {
        path.rank = rank;
      }
    }
  }
}
