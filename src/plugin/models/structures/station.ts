import { HVAlign, StationId, TextHAlign, TextVAlign } from "@/common/types";
import { LineAtStationData } from "@/common/messages";
import { TransportationMapObject } from './types';
import type { RoadSection, LinePass } from './road-section';
import { Line } from "./line";
import { OffsetT } from "@/plugin/utils/offset-t";

type SerializedHVAlign = 'l' | 'r' | 't' | 'b';
type SerializedTextHAlign = 'l' | 'c' | 'r';
type SerializedTextVAlign = 't' | 'c' | 'b';

const HV_ALIGN_CODES: Record<HVAlign, SerializedHVAlign> = { left: 'l', right: 'r', top: 't', bottom: 'b' };
const HV_ALIGN_VALUES: Record<SerializedHVAlign, HVAlign> = { l: 'left', r: 'right', t: 'top', b: 'bottom' };
const TEXT_H_ALIGN_CODES: Record<TextHAlign, SerializedTextHAlign> = { left: 'l', center: 'c', right: 'r' };
const TEXT_H_ALIGN_VALUES: Record<SerializedTextHAlign, TextHAlign> = { l: 'left', c: 'center', r: 'right' };
const TEXT_V_ALIGN_CODES: Record<TextVAlign, SerializedTextVAlign> = { top: 't', center: 'c', bottom: 'b' };
const TEXT_V_ALIGN_VALUES: Record<SerializedTextVAlign, TextVAlign> = { t: 'top', c: 'center', b: 'bottom' };

// Decode helpers accept either the current single-char code or a legacy full-word value.
function decodeHVAlign(v: SerializedHVAlign | HVAlign): HVAlign { return HV_ALIGN_VALUES[v as SerializedHVAlign] ?? (v as HVAlign); }
function decodeTextHAlign(v: SerializedTextHAlign | TextHAlign): TextHAlign { return TEXT_H_ALIGN_VALUES[v as SerializedTextHAlign] ?? (v as TextHAlign); }
function decodeTextVAlign(v: SerializedTextVAlign | TextVAlign): TextVAlign { return TEXT_V_ALIGN_VALUES[v as SerializedTextVAlign] ?? (v as TextVAlign); }

// Older documents were saved with full-word values (e.g. "right") before these were
// abbreviated to single-char codes; decoders below must accept either.
export interface SerializedStation {
  n: string;                             // name
  f: string | null;                      // figmaNodeId
  t: SerializedHVAlign | HVAlign;         // textAlign
  h?: SerializedTextHAlign | TextHAlign;  // textHAlign (absent → 'l')
  v?: SerializedTextVAlign | TextVAlign;  // textVAlign (absent → 'c')
  r?: number;                            // textRotation (absent → 0)
  l?: boolean;                           // flipped (absent → false)
  p: number;                             // interpT
}

export interface StationProps {
  name: string;
  textAlign: HVAlign;
  textHAlign: TextHAlign;
  textVAlign: TextVAlign;
  textRotation: number;
  flipped: boolean;
  interpT: number;
  roadSection: RoadSection | null;
}

export class Station extends TransportationMapObject<StationId> {
  name!: string;
  figmaNodeId: string | null = null;
  textAlign!: HVAlign;
  textHAlign!: TextHAlign;
  textVAlign!: TextVAlign;
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
    this.textVAlign = props.textVAlign;
    this.textRotation = props.textRotation;
    this.flipped = props.flipped;
    this._interpT = props.interpT;
    return this;
  }

  applySerialized(ser: SerializedStation): this {
    this.name = ser.n;
    this.textAlign = decodeHVAlign(ser.t);
    this.textHAlign = decodeTextHAlign(ser.h ?? 'l');
    this.textVAlign = decodeTextVAlign(ser.v ?? 'c');
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
      textVAlign: this.textVAlign,
      textRotation: this.textRotation,
      flipped: this.flipped,
      interpT: this._interpT,
      roadSection: this.parentRoadSection,
    };
  }

  serialize(): SerializedStation {
    return {
      n: this.name,
      f: this.figmaNodeId,
      t: HV_ALIGN_CODES[this.textAlign],
      h: TEXT_H_ALIGN_CODES[this.textHAlign],
      v: TEXT_V_ALIGN_CODES[this.textVAlign],
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
      for (const [passIndex, pass] of line.paths.entries()) {
        const stop = pass.stops.find(s => s.station === this);
        if (stop) passes.push({ line, passIndex, stationId: this.id, rank: stop.rank, stops: stop.stops });
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
  getStopsAcrossLines(): Array<{ line: Line; passIndex: number; rank: number; stops: boolean; facing: 'left' | 'right'; position: Vector }> {
    const entries: Array<{ rank: number; line: Line; passIndex: number; direction: 'ascending' | 'descending' }> = [];
    for (const line of this.mapState.getLines()) {
      for (const [passIndex, pass] of line.paths.entries()) {
        const stop = pass.stops.find(s => s.station === this);
        if (stop) entries.push({ rank: stop.rank, line, passIndex, direction: pass.direction });
      }
    }

    entries.sort((a, b) =>
      (a.rank - b.rank)
      || (a.line.id < b.line.id ? -1 : a.line.id > b.line.id ? 1 : 0)
      || (a.passIndex - b.passIndex)
    );
    entries.forEach((entry, rank) => {
      const stop = entry.line.paths[entry.passIndex]?.stops.find(s => s.station === this);
      if (stop) stop.rank = rank;
      entry.rank = rank;
    });

    const result: Array<{ line: Line; passIndex: number; rank: number; stops: boolean; facing: 'left' | 'right'; position: Vector }> = [];
    for (const { line, passIndex, direction, rank } of entries) {
      const pass = line.paths[passIndex];
      const stop = pass?.stops.find(s => s.station === this);
      const position = pass?.computeStopPosition(this.id);
      if (!pass || !stop || !position) continue;
      const facing: 'left' | 'right' = direction === 'ascending' ? 'right' : 'left';
      result.push({ line, passIndex, rank, stops: stop.stops, facing, position });
    }
    return result;
  }

  getLinesAtStationData(): LineAtStationData[] {
    return this.getStopsAcrossLines().map(({ line, passIndex, rank, stops, facing }) => ({
      id: line.id, name: line.name, color: line.color, passIndex, rank, facing, stops,
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

  updateStopRanks(stops: Array<{ line: Line; passIndex: number; rank: number; stops: boolean }>): void {
    for (const { line, passIndex, rank, stops: stopFlag } of stops) {
      const stop = line.paths[passIndex]?.stops.find(s => s.station === this);
      if (stop) { stop.rank = rank; stop.stops = stopFlag; }
    }
  }
}
