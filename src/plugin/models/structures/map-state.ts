import { LineId, NodeId, RoadId, RoadSectionId, StationId } from "@/common/types";
import { Node } from "./node";
import { Road } from "./road";
import { Station } from "./station";
import { Line } from "./line";
import { RoadSection } from "./road-section";
import { own, Owned } from "@/common/utils/ownership";
import { distSq } from "@/plugin/utils/math";
import { SnapResult } from "@/plugin/utils/snap";

export class MapState {
  private readonly nodes: Map<NodeId, Owned<Node>> = new Map();
  private readonly roads: Map<RoadId, Owned<Road>> = new Map();
  private readonly stations: Map<StationId, Owned<Station>> = new Map();
  private readonly lines: Map<LineId, Owned<Line>> = new Map();

  getNodeHarsh(nodeId: NodeId | undefined): Node {
    if (!nodeId) throw new Error(`Node ID is undefined`);
    const node = this.nodes.get(nodeId);
    if (!node) throw new Error(`Node with ID ${nodeId} not found`);
    return node;
  }

  getRoadHarsh(roadId: RoadId | undefined): Road {
    if (!roadId) throw new Error(`Road ID is undefined`);
    const road = this.roads.get(roadId);
    if (!road) throw new Error(`Road with ID ${roadId} not found`);
    return road;
  }

  getRoadSectionHarsh(sectionId: RoadSectionId | undefined): RoadSection {
    if (!sectionId) throw new Error(`RoadSection ID is undefined`);
    return this.getRoadHarsh(sectionId[0]).getSectionHarsh(sectionId[1]);
  }

  getStationHarsh(stationId: StationId | undefined): Station {
    if (!stationId) throw new Error(`Station ID is undefined`);
    const station = this.stations.get(stationId);
    if (!station) throw new Error(`Station with ID ${stationId} not found`);
    return station;
  }

  getLineHarsh(lineId: LineId | undefined): Line {
    if (!lineId) throw new Error(`Line ID is undefined`);
    const line = this.lines.get(lineId);
    if (!line) throw new Error(`Line with ID ${lineId} not found`);
    return line;
  }

  *getNodes(): IterableIterator<Node> { for (const node of this.nodes.values()) yield node; }
  *getRoads(): IterableIterator<Road> { for (const road of this.roads.values()) yield road; }
  *getStations(): IterableIterator<Station> { for (const station of this.stations.values()) yield station; }
  *getLines(): IterableIterator<Line> { for (const line of this.lines.values()) yield line; }

  getNode(id: NodeId): Node | undefined { return this.nodes.get(id); }
  getRoad(id: RoadId): Road | undefined { return this.roads.get(id); }
  getStation(id: StationId): Station | undefined { return this.stations.get(id); }
  getLine(id: LineId): Line | undefined { return this.lines.get(id); }

  addNode(node: Node): void { this.nodes.set(node.id, own(node)); }
  addRoad(road: Road): void { this.roads.set(road.id, own(road)); }
  addStation(station: Station): void { this.stations.set(station.id, own(station)); }
  addLine(line: Line): void { this.lines.set(line.id, own(line)); }

  removeNode(node: Node): void { this.nodes.delete(node.id); }
  removeRoad(road: Road): void { this.roads.delete(road.id); }
  removeStation(station: Station): void { this.stations.delete(station.id); }
  removeLine(line: Line): void { this.lines.delete(line.id); }

  hasNode(id: NodeId): boolean { return this.nodes.has(id); }
  hasRoad(id: RoadId): boolean { return this.roads.has(id); }
  hasStation(id: StationId): boolean { return this.stations.has(id); }
  hasLine(id: LineId): boolean { return this.lines.has(id); }

  // Empties every slice in place (rather than swapping in a new MapState) so
  // existing references — e.g. Model.state, held by every controller — stay valid.
  // Used to reset before deserializing a snapshot back in (undo/redo, reload).
  clear(): void {
    this.nodes.clear();
    this.roads.clear();
    this.stations.clear();
    this.lines.clear();
  }

  normalize(): void {
    for (const road of this.getRoads()) {
      for (const section of road.getSections()) {
        section.getLineStackingRanks(0);
        section.getLineStackingRanks(1);
      }
    }
    for (const station of this.getStations()) {
      station.getStopsAcrossLines();
    }
  }

  findNearestRoadSection(point: Vector): SnapResult | null {
    let best: SnapResult | null = null;
    let bestDist = Infinity;

    for (const road of this.getRoads()) {
      const bezier = road.computeBezier();
      if (!bezier) continue;
      const sections = [...road.getSections()];
      if (sections.length === 0) continue;

      const t = bezier.nearestT(point);

      for (const section of sections) {
        const pos = bezier.sectionPosAt(t, section.computeOffset());
        const d = distSq(pos, point);
        if (d < bestDist) {
          bestDist = d;
          best = { section, interpT: t, pos };
        }
      }
    }

    return best;
  }

}