import { LineId, NodeId, RoadId, RoadSectionId, SectionId, StationId } from "@/common/types";
import { Line, LineProps, MapState, Node, NodeProps, PassStop, Road, RoadProps, RoadSection, RoadSectionProps, RoadSectionPass, Station, StationProps } from "./structures";
import { deserializeMapState, serializeMapState } from "./serde";
import { validateLinePaths } from "../utils/line-validator";
import { own } from "@/common/utils/ownership";

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

  // Splits `road` at bezier parameter `t` into two roads joined by a new junction node.
  // Every section is cloned onto both halves (by name/index), stations are reparented to
  // whichever half they now fall on with interpT remapped to that half's local param, and
  // any line's existing pass through one of the old sections is split in two — one pass
  // per half, in the same travel direction, each keeping whichever real stops now fall on
  // its side — with a fresh (placeholder-rank) boundary at the new split node in between.
  public splitRoad(road: Road, t: number, junctionRadius: number): Node {
    const bezier = road.computeBezier();
    if (!bezier) throw new Error('Cannot split a road without both endpoints');
    const { left, right } = bezier.split(t);

    const startConn = road.endpoints[0];
    const endConn   = road.endpoints[1];

    const splitNode = this.addNode({ position: bezier.eval(t), radius: junctionRadius });

    const roadLeft = this.addRoad({
      name: road.name,
      bezierMidPoint: left.p1,
      endpoints: [
        own({ node: startConn.node, horizontalOffset: startConn.horizontalOffset, groupNumber: startConn.groupNumber }),
        own({ node: splitNode, horizontalOffset: 0, groupNumber: 0 }),
      ],
    });
    const roadRight = this.addRoad({
      name: undefined,
      bezierMidPoint: right.p1,
      endpoints: [
        own({ node: splitNode, horizontalOffset: 0, groupNumber: 0 }),
        own({ node: endConn.node, horizontalOffset: endConn.horizontalOffset, groupNumber: endConn.groupNumber }),
      ],
    });

    // addRoad() auto-creates a default (unnamed, index 0) section on each half; drop those
    // and rebuild sections matching the original road's, one-to-one, on both halves.
    roadLeft.removeSection(roadLeft.getSectionByIndex(0)!);
    roadRight.removeSection(roadRight.getSectionByIndex(0)!);

    const sectionMap = new Map<RoadSection, { left: RoadSection; right: RoadSection }>();
    for (const section of road.getSectionsByIndex()) {
      const leftSection  = this.addRoadSection(roadLeft,  { name: section.name, index: section.index });
      const rightSection = this.addRoadSection(roadRight, { name: section.name, index: section.index });
      sectionMap.set(section, { left: leftSection, right: rightSection });

      for (const station of [...section.stations]) {
        const rawT = station.rawInterpT;
        if (rawT <= t) {
          station.setInterpT(t < 0.000001 ? 0 : rawT / t);
          station.setParent(leftSection);
          leftSection.stations.push(station);
        } else {
          station.setInterpT(t > 0.999999 ? 0 : (rawT - t) / (1 - t));
          station.setParent(rightSection);
          rightSection.stations.push(station);
        }
      }
    }

    // Split any existing pass through one of the original road's sections into two
    // passes — one per half, in the same travel direction — since stations have
    // already been reparented above (so `station.parentRoadSection` already tells
    // us which half each stop now belongs to).
    for (const line of this.state.getLines()) {
      const newPaths: RoadSectionPass[] = [];
      let changed = false;
      for (const pass of line.paths) {
        const mapped = sectionMap.get(pass.section);
        if (!mapped) { newPaths.push(pass); continue; }
        changed = true;

        const leftStops  = pass.stops.filter(s => s.station.parentRoadSection === mapped.left);
        const rightStops = pass.stops.filter(s => s.station.parentRoadSection === mapped.right);
        // Ascending means traveling from the original road's endpoint[0] (left's far
        // node) toward endpoint[1] (right's far node) — same order the halves keep
        // their original outer endpoints in.
        const ordered = pass.direction === 'ascending' ? [mapped.left, mapped.right] : [mapped.right, mapped.left];
        ordered.forEach((section, i) => {
          const stops: PassStop[] = section === mapped.left ? leftStops : rightStops;
          const p = new RoadSectionPass();
          p.section = section;
          p.direction = pass.direction;
          p.fromRank = i === 0 ? pass.fromRank : 0; // 0 = placeholder at the new split-node boundary
          p.toRank = i === ordered.length - 1 ? pass.toRank : 0;
          p.stops = stops;
          newPaths.push(p);
        });
      }
      if (changed) line.paths = newPaths;
    }

    for (const node of this.state.getNodes()) {
      node.roadConnections = node.roadConnections.filter(rc => rc.road !== road);
    }
    this.state.removeRoad(road);

    this.validateAllLinePaths();

    return splitNode;
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
      const before = line.paths.length;
      // Removing a pass outright (rather than nulling a field) is the direct
      // equivalent now — any resulting discontinuity with its neighbors surfaces
      // as an invalid-jump the next time displayEntries are built, same as before.
      line.paths = line.paths.filter(pass => !sectionSet.has(pass.section));
      if (line.paths.length !== before) line.paths = validateLinePaths(line);
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
      for (const pass of line.paths) {
        const before = pass.stops.length;
        pass.stops = pass.stops.filter(s => s.station !== station);
        if (pass.stops.length !== before) changed = true;
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
