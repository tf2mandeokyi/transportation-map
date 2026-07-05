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

  // Set to true right after a virtual U-turn; consumed by the *next* emitTraversal
  // call so the group starting after the U-turn is padded all the way out to the
  // section's far boundary — symmetric with extendToSi padding the group before
  // it out to the same boundary. This shows the full section extent (greyed)
  // receding from view on both sides of every U-turn, not just the pivot station.
  let pendingStartExtend = false;

  // Current traversal accumulator — all stops share one direction and section.
  let travStops: StationStop[] = [];
  let travSection: RoadSection | null = null;
  let travDir: 'ascending' | 'descending' | null = null;

  // Emit the current traversal group.
  // cutByUturn: true when this traversal is being cut short by a virtual U-turn —
  // the whole remaining section extent (down to the far boundary) is padded in as
  // greyed stations, showing the line physically receding toward the reversal point
  // even past whatever station triggered it.
  const emitTraversal = (cutByUturn: boolean = false) => {
    if (travStops.length === 0 || travSection === null || travDir === null) return;

    const section = travSection;
    const dir = travDir;
    const sorted = getSorted(section);

    const stopsWithIdx = travStops.map(stop => ({
      stop,
      si: sortedIdx(stop.station, sorted),
    }));
    stopsWithIdx.sort((a, b) => dir === 'ascending' ? a.si - b.si : b.si - a.si);

    const firstSi = stopsWithIdx[0].si;
    const lastSi  = stopsWithIdx[stopsWithIdx.length - 1].si;

    const startExtend = pendingStartExtend;
    pendingStartExtend = false;

    let lo: number, hi: number;
    if (dir === 'ascending') {
      lo = firstSi;
      if (prevLastSortedIdx !== null) lo = Math.min(lo, prevLastSortedIdx);
      // Pad all the way down to the section's start (mirrors the U-turn on the other side).
      if (startExtend) lo = 0;
      hi = lastSi;
      // Pad all the way up to the section's end, toward the reversal point.
      if (cutByUturn) hi = sorted.length - 1;
    } else {
      hi = firstSi;
      if (prevLastSortedIdx !== null) hi = Math.max(hi, prevLastSortedIdx);
      // Pad all the way up to the section's end (mirrors the U-turn on the other side).
      if (startExtend) hi = sorted.length - 1;
      lo = lastSi;
      // Pad all the way down to the section's start, toward the reversal point.
      if (cutByUturn) lo = 0;
    }

    const stopMap = new Map<Station, boolean>();
    for (const stop of travStops) stopMap.set(stop.station, stop.stops);

    const indices = dir === 'ascending'
      ? Array.from({ length: hi - lo + 1 }, (_, k) => lo + k)
      : Array.from({ length: hi - lo + 1 }, (_, k) => hi - k);

    const stations: DisplayStation[] = [];
    for (const i of indices) {
      const st = sorted[i];
      if (!st) continue;
      stations.push({
        stationId: st.id,
        name: st.name,
        stops: stopMap.get(st) ?? false,
      });
    }

    if (stations.length > 0) displayEntries.push({ kind: 'traversal', direction: dir, stations });
    prevLastSortedIdx = lastSi;

    travStops   = [];
    travSection = null;
    travDir     = null;
  };

  const processRse = (rse: RoadSectionChange) => {
    emitTraversal(); // no look-ahead extension at explicit RSE boundaries

    const isUturn = !!(rse.exiting && rse.exiting.section === rse.entering?.section);
    displayEntries.push({
      kind: 'rse',
      isUturn,
      nodeId: rse.node.id,
      nodeName: rse.node.name ?? null,
      exitRoadName:  rse.exiting?.section.parentRoad.name  ?? null,
      enterRoadName: rse.entering?.section.parentRoad.name ?? null,
      exitSectionLabel:  rse.exiting  ? (rse.exiting.section.name  ?? `section #${rse.exiting.section.id}`)  : null,
      enterSectionLabel: rse.entering ? (rse.entering.section.name ?? `section #${rse.entering.section.id}`) : null,
    });
    if (!isUturn) prevLastSortedIdx = null;
  };

  const processStop = (stop: StationStop) => {
    const section = stop.station.parentRoadSection;
    const dir     = stop.direction;

    if (travDir !== null && travSection === section && travDir !== dir) {
      // Direction reversal on the same section without an RSC = virtual U-turn.
      // Pad the segment on both sides out to the section's boundary as greyed
      // pass-throughs, showing the line physically receding toward the reversal point.
      emitTraversal(true);
      displayEntries.push({ kind: 'virtual-uturn' });
      pendingStartExtend = true;
      // prevLastSortedIdx is preserved through the virtual U-turn (set by emitTraversal).
    } else if (travSection !== null && travSection !== section) {
      // Section changed without RSC — shouldn't happen in valid data; just flush.
      emitTraversal();
    }

    travSection = section;
    travDir     = dir;
    travStops.push(stop);
  };

  for (const group of paths) {
    if (group.fromRoadSectionChange) processRse(group.fromRoadSectionChange);
    for (const stop of group.stationStops) processStop(stop);
  }

  emitTraversal();
  return displayEntries;
}
