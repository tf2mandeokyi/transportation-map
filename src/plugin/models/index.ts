import { LineId, NodeId, RoadId, RoadSectionId, SectionId, StationId } from "@/common/types";
import { Line, LineProps, MapState, Node, NodeProps, Road, RoadProps, RoadSection, RoadSectionProps, Station, StationProps } from "./structures";
import { deserializeMapState, serializeMapState } from "./serde";
import { validateLinePaths } from "../utils/line-validator";

function generateBase62(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function generateUniqueId<T extends string>(hasId: (id: T) => boolean): T {
  let length = 1;
  while (true) {
    const id = generateBase62(length) as T;
    if (!hasId(id)) return id;
    length++;
  }
}

export class Model {
  readonly state: MapState;

  constructor() {
    this.state = new MapState();
  }

  // ─── Node ───

  public addNode(node: NodeProps): Node {
    const id = generateUniqueId<NodeId>(id => this.state.hasNode(id));
    const obj = new Node(this.state, id).applyProps(node);
    this.state.addNode(obj);
    return obj;
  }

  public removeNode(node: Node): void {
    for (const { road } of [...node.roadConnections]) {
      this.removeRoad(road);
    }
    this.state.removeNode(node);
  }

  // ─── Road ───

  public addRoad(road: RoadProps): Road {
    const id = generateUniqueId<RoadId>(id => this.state.hasRoad(id));
    const obj = new Road(this.state, id).applyProps(road);
    this.state.addRoad(obj);
    road.endpoints[0].node.addRoadConnection(obj, 0);
    road.endpoints[1].node.addRoadConnection(obj, 1);
    this.addRoadSection(obj, { index: 0 });
    return obj;
  }

  public removeRoad(road: Road): void {
    for (const node of this.state.getNodes()) {
      node.roadConnections = node.roadConnections.filter(rc => rc.road !== road);
    }
    for (const section of road.getSections()) {
      for (const station of [...section.stations]) {
        this.removeStation(station);
      }
    }
    this._removeRoadFromLines(road);
    this.state.removeRoad(road);
  }

  // ─── RoadSection ───

  public addRoadSection(road: Road, section: RoadSectionProps): RoadSection {
    const id = generateUniqueId<SectionId>(id => road.hasSection(id));
    const obj = new RoadSection(this.state, id).applyProps(road, section);
    road.addSection(obj);
    return obj;
  }

  public removeRoadSection(section: RoadSection): void {
    for (const station of [...section.stations]) {
      this.removeStation(station);
    }
    section.parentRoad.removeSection(section);
  }

  private _removeRoadFromLines(road: Road): void {
    const sectionSet = new Set(road.getSections());
    for (const line of this.state.getLines()) {
      let changed = false;
      for (const group of line.paths) {
        const rsc = group.fromRoadSectionChange;
        if (!rsc) continue;
        if ((rsc.exiting !== null && sectionSet.has(rsc.exiting.section)) ||
            (rsc.entering !== null && sectionSet.has(rsc.entering.section))) {
          group.fromRoadSectionChange = undefined;
          changed = true;
        }
      }
      if (changed) line.paths = validateLinePaths(line);
    }
  }

  // ─── Station ───

  public addStation(station: StationProps): Station {
    const id = generateUniqueId<StationId>(id => this.state.hasStation(id));
    const obj = new Station(this.state, id).applyProps(station);
    this.state.addStation(obj);
    if (station.roadSection) {
      obj.setParent(station.roadSection);
      station.roadSection.stations.push(obj);
    }
    return obj;
  }

  public findSection(sectionId: RoadSectionId): RoadSection | null {
    try {
      return this.state.getRoadSectionHarsh(sectionId);
    } catch {
      return null;
    }
  }

  public removeStation(station: Station): void {
    const parentSection = station.parentRoadSection as RoadSection | undefined;
    if (parentSection) {
      parentSection.stations = parentSection.stations.filter(s => s !== station);
    }
    for (const line of this.state.getLines()) {
      let changed = false;
      for (const group of line.paths) {
        const before = group.stationStops.length;
        group.stationStops = group.stationStops.filter(s => s.station !== station);
        if (group.stationStops.length !== before) changed = true;
      }
      if (changed) line.paths = validateLinePaths(line);
    }
    this.state.removeStation(station);
  }

  public findStationByFigmaId(figmaNodeId: string): Station | null {
    for (const station of this.state.getStations()) {
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
    const id = generateUniqueId<LineId>(id => this.state.hasLine(id));
    const obj = new Line(this.state, id).applyProps({ ...line, figmaGroupId: null });
    this.state.addLine(obj);
    return obj;
  }

  public removeLine(id: LineId): void {
    const line = this.state.getLine(id);
    if (line) this.state.removeLine(line);
  }

  public updateLineStackingOrder(_newOrder: LineId[]): void {
    // lineStackingOrder deprecated — no-op kept for call-site compatibility
  }

  // ─── LinePath ───

  public validateAllLinePaths(): void {
    for (const line of this.state.getLines()) {
      line.paths = validateLinePaths(line);
    }
  }

  public validateRoadSections(): void {
    for (const road of this.state.getRoads()) {
      if ([...road.getSections()].length === 0) {
        this.addRoadSection(road, { index: 0 });
      }
    }
  }

  // ─── Persistence ───

  public async save(): Promise<void> {
    this.state.normalize();
    const serialized = serializeMapState(this.state);
    figma.root.setPluginData('mapState', serialized);
  }

  public static async load(): Promise<Model | null> {
    const data = figma.root.getPluginData('mapState');
    if (!data) return null;

    const model = new Model();
    const success = deserializeMapState(data, model.state);
    if (!success) return null;

    model.validateRoadSections();
    model.validateAllLinePaths();
    model.state.normalize();
    return model;
  }
}
