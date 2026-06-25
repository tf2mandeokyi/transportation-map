import { IModel, Line, LineProps, MapState, Node, NodeProps, Road, RoadProps, RoadSection, RoadSectionProps, Station, StationProps } from "./structures";
import { deserializeMapState, serializeMapState } from "./serde";
import { LineId, RoadSectionId } from "@/common/types";
import { validateLinePaths } from "../utils/line-validator";

function generateBase62(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function generateUniqueId<T extends string>(map: Map<T, unknown>): T {
  let length = 1;
  while (true) {
    const id = generateBase62(length) as T;
    if (!map.has(id)) return id;
    length++;
  }
}

export class Model {
  readonly state: MapState;

  constructor() {
    this.state = {
      nodes: new Map(),
      roads: new Map(),
      stations: new Map(),
      lines: new Map(),
      lineStackingOrder: [],
    };
  }

  // ─── Node ───

  public addNode(node: NodeProps): Node {
    const id = generateUniqueId(this.state.nodes);
    const obj = new Node(this, id, node);
    this.state.nodes.set(id, obj);
    return obj;
  }

  public removeNode(node: Node): void {
    for (const road of node.roadConnections.map(rc => rc.road)) {
      this.removeRoad(road);
    }
    this.state.nodes.delete(node.id);
  }

  public moveNodeConnections(node: Node, delta: { x: number; y: number }): void {
    for (const { road, endpointIndex } of node.roadConnections) {
      const conn = road.endpoints[endpointIndex];
      road.endpoints[endpointIndex] = {
        ...conn,
        endpointPos: { x: conn.endpointPos.x + delta.x, y: conn.endpointPos.y + delta.y },
      };
    }
  }

  // ─── Road ───

  public addRoad(road: RoadProps): Road {
    const id = generateUniqueId(this.state.roads);
    const obj = new Road(this, id, road);
    this.state.roads.set(id, obj);

    obj.startNode = road.startNode;
    road.startNode.roadConnections.push({ road: obj, endpointIndex: 0 });
    obj.endNode = road.endNode;
    road.endNode.roadConnections.push({ road: obj, endpointIndex: 1 });

    return obj;
  }

  public removeRoad(road: Road): void {
    for (const node of this.state.nodes.values()) {
      node.roadConnections = node.roadConnections.filter(rc => rc.road !== road);
    }

    for (const section of road.sections.values()) {
      for (const station of [...section.stations]) {
        this.removeStation(station);
      }
    }

    this._removeRoadFromLines(road);
    this.state.roads.delete(road.id);
  }

  // ─── RoadSection ───

  public addRoadSection(road: Road, section: RoadSectionProps): RoadSection {
    const allSectionIds = new Map<RoadSectionId, true>();
    for (const r of this.state.roads.values()) {
      for (const sid of r.sections.keys()) allSectionIds.set(sid, true);
    }
    const id = generateUniqueId(allSectionIds);

    const obj = new RoadSection(this, id, section);
    obj.road = road;
    road.sections.set(id, obj);
    return obj;
  }

  public removeRoadSection(section: RoadSection): void {
    for (const station of [...section.stations]) {
      this.removeStation(station);
    }
    section.road.sections.delete(section.id);
  }

  private _removeRoadFromLines(road: Road): void {
    const sectionSet = new Set(road.sections.values());
    for (const line of this.state.lines.values()) {
      line.paths = line.paths.filter(p => {
        if (p.kind !== 'road-section-change') return true;
        return !((p.exiting !== null && sectionSet.has(p.exiting)) ||
                 (p.entering !== null && sectionSet.has(p.entering)));
      });
      this._reindexLinePaths(line);
    }
  }

  // ─── Station ───

  public addStation(station: StationProps): Station {
    const id = generateUniqueId(this.state.stations);
    const obj = new Station(this.state, id, station);
    this.state.stations.set(id, obj);

    if (station.roadSection) {
      obj.roadSection = station.roadSection;
      station.roadSection.stations.push(obj);
    }

    return obj;
  }

  public findSection(sectionId: RoadSectionId): RoadSection | null {
    return this._findSection(sectionId);
  }

  public removeStation(station: Station): void {
    if (station.roadSection) {
      station.roadSection.stations = station.roadSection.stations.filter(s => s !== station);
    }

    for (const line of this.state.lines.values()) {
      line.paths = line.paths.filter(p => !(p.kind === 'station-stop' && p.station === station));
      this._reindexLinePaths(line);
    }

    this.state.stations.delete(station.id);
  }

  public findStationByFigmaId(figmaNodeId: string): Station | null {
    for (const station of this.state.stations.values()) {
      if (station.figmaNodeId === figmaNodeId) return station;
    }
    return null;
  }

  public findStationFromNode(node: SceneNode): Station | null {
    let currentNode: BaseNode | null = node;
    while (currentNode && 'id' in currentNode) {
      const station = this.findStationByFigmaId(currentNode.id);
      if (station) return station;
      currentNode = currentNode.parent;
    }
    return null;
  }

  // ─── Line ───

  public addLine(line: Omit<LineProps, 'figmaGroupId'>): Line {
    const id = generateUniqueId(this.state.lines);
    const obj = new Line(this, id, line);
    this.state.lines.set(id, obj);
    if (!this.state.lineStackingOrder.includes(id)) {
      this.state.lineStackingOrder.push(id);
    }
    return obj;
  }

  public removeLine(id: LineId): void {
    this.state.lines.delete(id);
    const index = this.state.lineStackingOrder.indexOf(id);
    if (index !== -1) this.state.lineStackingOrder.splice(index, 1);
  }

  public updateLineStackingOrder(newOrder: LineId[]): void {
    this.state.lineStackingOrder = [...newOrder];
  }

  // ─── LinePath ───


  public validateAllLinePaths(): void {
    for (const line of this.state.lines.values()) {
      line.paths = validateLinePaths(line);
    }
  }

  private _reindexLinePaths(line: Line): void {
    line.paths.forEach((p, i) => { p.index = i; });
  }

  // ─── Helpers ───

  private _findSection(sectionId: RoadSectionId): RoadSection | null {
    for (const road of this.state.roads.values()) {
      const section = road.sections.get(sectionId);
      if (section) return section;
    }
    return null;
  }

  // ─── Persistence ───

  public async save(): Promise<void> {
    const serialized = serializeMapState(this.state);
    figma.root.setPluginData('mapState', serialized);
  }

  public static async load(): Promise<Model | null> {
    const data = figma.root.getPluginData('mapState');
    if (!data) return null;

    const model = new Model();
    const state = deserializeMapState(data, model);
    if (!state) return null;

    Object.assign(model.state, state);
    model.validateAllLinePaths();
    return model;
  }
}
