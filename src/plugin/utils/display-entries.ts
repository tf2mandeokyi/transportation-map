import { StationId } from "@/common/types";
import { DisplayEntry, DisplayStation } from "@/common/messages";
import { LinePath, RoadSectionChange, StationStop } from "../models/structures/line-path";
import { RoadSection } from "../models/structures/road-section";
import { Station } from "../models/structures/station";

function getSorted(section: RoadSection): Station[] {
  return [...section.stations].sort((a, b) => a.interpT.compare(b.interpT));
}

function sortedIdx(station: Station, sorted: Station[]): number {
  return sorted.findIndex(s => s === station);
}

export function buildDisplayEntries(paths: readonly LinePath[]): DisplayEntry[] {
  const displayEntries: DisplayEntry[] = [];
  let prevLastSortedIdx: number | null = null;

  // Current traversal accumulator — all stops share one direction and section.
  let travStops: Array<{ stop: StationStop; pathIndex: number }> = [];
  let travSection: RoadSection | null = null;
  let travDir: 'ascending' | 'descending' | null = null;

  // Emit the current traversal group.
  // extendToSi: when the traversal is cut by a virtual U-turn, the next stop's si
  // is passed so we can extend the visible range to include it as a greyed station
  // (showing the line physically passing through it on the way to the reversal point).
  const emitTraversal = (extendToSi: number | null = null) => {
    if (travStops.length === 0 || travSection === null || travDir === null) return;

    const section = travSection;
    const dir = travDir;
    const sorted = getSorted(section);

    const stopsWithIdx = travStops.map(({ stop, pathIndex }) => ({
      stop, pathIndex,
      si: sortedIdx(stop.station, sorted),
    }));
    stopsWithIdx.sort((a, b) => dir === 'ascending' ? a.si - b.si : b.si - a.si);

    const firstSi = stopsWithIdx[0].si;
    const lastSi  = stopsWithIdx[stopsWithIdx.length - 1].si;

    let lo: number, hi: number;
    if (dir === 'ascending') {
      lo = prevLastSortedIdx !== null ? Math.min(prevLastSortedIdx, firstSi) : firstSi;
      hi = lastSi;
      // Extend hi upward to include the next descending stop as greyed.
      if (extendToSi !== null) hi = Math.max(hi, extendToSi);
    } else {
      lo = lastSi;
      hi = prevLastSortedIdx !== null ? Math.max(prevLastSortedIdx, firstSi) : firstSi;
      // Extend lo downward to include the next ascending stop as greyed.
      if (extendToSi !== null) lo = Math.min(lo, extendToSi);
    }

    const inPathMap = new Map<StationId, { pathIndex: number; stops: boolean }>();
    for (const { stop, pathIndex } of travStops) {
      inPathMap.set(stop.station.id, { pathIndex, stops: stop.stops });
    }

    const indices = dir === 'ascending'
      ? Array.from({ length: hi - lo + 1 }, (_, k) => lo + k)
      : Array.from({ length: hi - lo + 1 }, (_, k) => hi - k);

    const stations: DisplayStation[] = [];
    for (const i of indices) {
      const st = sorted[i];
      if (!st) continue;
      const entry = inPathMap.get(st.id);
      stations.push({
        stationId: st.id,
        name: st.name,
        inPath: entry !== undefined,
        pathIndex: entry?.pathIndex ?? -1,
        stops: entry?.stops ?? false,
      });
    }

    if (stations.length > 0) displayEntries.push({ kind: 'traversal', direction: dir, stations });
    prevLastSortedIdx = lastSi;

    travStops   = [];
    travSection = null;
    travDir     = null;
  };

  for (const p of paths) {
    if (p instanceof RoadSectionChange) {
      const rse = p;
      emitTraversal(); // no look-ahead extension at explicit RSE boundaries

      const isUturn = !!(rse.exiting && rse.entering && rse.exiting.section === rse.entering.section);
      displayEntries.push({
        kind: 'rse',
        pathIndex: p.index,
        isUturn,
        nodeId: rse.node.id,
        nodeName: rse.node.name ?? null,
        exitRoadName:  rse.exiting?.section.parentRoad.name  ?? null,
        enterRoadName: rse.entering?.section.parentRoad.name ?? null,
      });
      if (!isUturn) prevLastSortedIdx = null;
    } else if (p instanceof StationStop) {
      const stop    = p;
      const section = stop.station.parentRoadSection;
      const dir     = stop.direction;

      if (travDir !== null && travSection === section && travDir !== dir) {
        // Direction reversal on the same section without an RSC = virtual U-turn.
        // Extend the current segment's range to include the next stop as a greyed
        // pass-through, showing the line physically passing through it on the way down.
        const sorted    = getSorted(section);
        const nextSi    = sortedIdx(stop.station, sorted);
        emitTraversal(nextSi);
        displayEntries.push({ kind: 'virtual-uturn' });
        // prevLastSortedIdx is preserved through the virtual U-turn (set by emitTraversal).
      } else if (travSection !== null && travSection !== section) {
        // Section changed without RSC — shouldn't happen in valid data; just flush.
        emitTraversal();
      }

      travSection = section;
      travDir     = dir;
      travStops.push({ stop, pathIndex: p.index });
    }
  }

  emitTraversal();
  return displayEntries;
}
