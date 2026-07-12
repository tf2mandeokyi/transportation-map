import { DisplayEntry } from "@/common/messages";
import { RoadSectionPass } from "../models/structures/line-path";
import { Node } from "../models/structures/node";

// The boundary between `fromPass` and `toPass` (either may be null, at the true start
// or end of the path — no longer a special case, just an entry with nothing on that
// side). isUturn is a same-section adjacency, replacing the old RSC.isUturn flag.
function boundaryEntry(boundaryIndex: number, fromPass: RoadSectionPass | null, toPass: RoadSectionPass | null): DisplayEntry {
  const node: Node | null = fromPass?.toNode ?? (toPass ? toPass.fromNode : null);
  const isUturn = !!(fromPass && fromPass.section === toPass?.section);
  return {
    kind: 'boundary',
    boundaryIndex,
    isUturn,
    nodeId: node?.id ?? null,
    nodeName: node?.name ?? null,
    fromRoadName: fromPass?.section.parentRoad.name ?? null,
    toRoadName: toPass?.section.parentRoad.name ?? null,
    fromSectionLabel: fromPass ? (fromPass.section.name ?? `section #${fromPass.section.id}`) : null,
    toSectionLabel: toPass ? (toPass.section.name ?? `section #${toPass.section.id}`) : null,
  };
}

export function buildDisplayEntries(passes: readonly RoadSectionPass[]): DisplayEntry[] {
  const entries: DisplayEntry[] = [];

  passes.forEach((pass, i) => {
    if (i === 0) entries.push(boundaryEntry(0, null, pass));

    entries.push({
      kind: 'traversal',
      passIndex: i,
      direction: pass.direction,
      stations: pass.stops.map(s => ({ stationId: s.station.id, name: s.station.name, stops: s.stops, passIndex: i })),
    });

    const next = passes[i + 1];
    if (next) {
      // Adjacent passes don't connect — missing road data between them.
      if (pass.toNode !== next.fromNode) {
        entries.push({
          kind: 'invalid-jump',
          boundaryIndex: i + 1,
          fromNodeId: pass.toNode.id,
          fromNodeName: pass.toNode.name ?? null,
          toNodeId: next.fromNode.id,
          toNodeName: next.fromNode.name ?? null,
        });
      } else {
        entries.push(boundaryEntry(i + 1, pass, next));
      }
    } else {
      entries.push(boundaryEntry(passes.length, pass, null));
    }
  });

  return entries;
}
