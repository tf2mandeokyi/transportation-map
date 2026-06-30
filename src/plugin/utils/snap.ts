import { RoadSection } from '../models/structures';

export interface SnapResult {
  section: RoadSection;
  interpT: number;
  pos: Vector;
}