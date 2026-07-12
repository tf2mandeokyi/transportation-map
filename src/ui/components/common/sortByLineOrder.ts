import { LineData } from '@/common/messages';
import { LineId } from '@/common/types';

// Sorts a ranked-pass list to match the order lines appear in the main Lines list
// (i.e. their stacking order), rather than their current per-list rank.
export function sortByLineOrder<T>(items: T[], lines: LineData[], getLineId: (item: T) => LineId, reverse: boolean): T[] {
  const indexOf = new Map(lines.map((l, i) => [l.id, i]));
  const sorted = [...items].sort((a, b) => (indexOf.get(getLineId(a)) ?? 0) - (indexOf.get(getLineId(b)) ?? 0));
  if (reverse) sorted.reverse();
  return sorted;
}
