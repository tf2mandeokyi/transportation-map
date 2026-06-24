import { Connection, IModel, Line, LineProps, MapState, Node, NodeProps, Road, RoadProps, RoadSection, RoadSectionChange, RoadSectionProps, Station, StationProps } from "./structures";
import { deserializeMapState, serializeMapState } from "./serde";
import { LineId, NodeId, RoadId, RoadSectionId, StationId } from "@/common/types";
import { LinePathInput } from "@/common/messages";
import { validateLinePaths } from "../utils/line-validator";
import { getStationStopsAcrossLines, getRscEntriesForNode } from "../utils/line-queries";

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

export class Model implements IModel {
  private readonly state: MapState;

  constructor() {
    this.state = {
      nodes: new Map(),
      roads: new Map(),
      stations: new Map(),
      lines: new Map(),
      lineStackingOrder: [],
    };
  }

  public getState(): Readonly<MapState> {
    return this.state;
  }

  // ─── Node ───

  public addNode(node: NodeProps): Node {
    const id = generateUniqueId(this.state.nodes);
    const obj = new Node(this, id, node);
    this.state.nodes.set(id, obj);
    return obj;
  }

  public updateIsolatedNodePos(id: NodeId, pos: Vector): void {
    const node = this.state.nodes.get(id);
    if (node?.roadConnections.length === 0) node.isolatedPos = pos;
  }

  public updateNodeName(id: NodeId, name: string | undefined): void {
    const node = this.state.nodes.get(id);
    if (node) node.name = name;
  }

  public removeNode(id: NodeId): void {
    const node = this.state.nodes.get(id);
    if (!node) return;
    const roadIds = node.roadConnections.map(rc => rc.road.id);
    for (const roadId of roadIds) {
      this.removeRoad(roadId);
    }
    this.state.nodes.delete(id);
  }

  public moveNodeConnections(id: NodeId, delta: { x: number; y: number }): void {
    const node = this.state.nodes.get(id);
    if (!node) return;
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

    const startNode = this.state.nodes.get(road.startNodeId);
    if (startNode) {
      obj.startNode = startNode;
      startNode.roadConnections.push({ road: obj, endpointIndex: 0 });
    }

    const endNode = this.state.nodes.get(road.endNodeId);
    if (endNode) {
      obj.endNode = endNode;
      endNode.roadConnections.push({ road: obj, endpointIndex: 1 });
    }

    return obj;
  }

  public updateRoadEndpoints(id: RoadId, endpoints: [Connection, Connection]): void {
    const road = this.state.roads.get(id);
    if (road) road.endpoints = endpoints;
  }

  public updateRoadBezierMidPoint(id: RoadId, midPoint: Vector): void {
    const road = this.state.roads.get(id);
    if (road) road.bezierMidPoint = midPoint;
  }

  public removeRoad(id: RoadId): void {
    const road = this.state.roads.get(id);
    if (!road) return;

    for (const node of this.state.nodes.values()) {
      node.roadConnections = node.roadConnections.filter(rc => rc.road.id !== id);
    }

    for (const section of road.sections.values()) {
      const stationIds = section.stations.map(s => s.id);
      for (const stationId of stationIds) {
        this.removeStation(stationId);
      }
    }

    this._removeRoadFromLines(id);
    this.state.roads.delete(id);
  }

  // ─── RoadSection ───

  public addRoadSection(roadId: RoadId, section: RoadSectionProps): RoadSection {
    const road = this.state.roads.get(roadId);
    if (!road) throw new Error(`Road ${roadId} not found`);

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

  public removeRoadSection(roadId: RoadId, sectionId: RoadSectionId): void {
    const road = this.state.roads.get(roadId);
    if (!road) return;

    const section = road.sections.get(sectionId);
    if (section) {
      const stationIds = section.stations.map(s => s.id);
      for (const stationId of stationIds) {
        this.removeStation(stationId);
      }
    }

    road.sections.delete(sectionId);
  }

  private _removeRoadFromLines(roadId: RoadId): void {
    const road = this.state.roads.get(roadId);
    const sectionSet = road ? new Set(road.sections.values()) : new Set<RoadSection>();
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
    const obj = new Station(this, id, station);
    this.state.stations.set(id, obj);

    if (station.roadSectionId) {
      const section = this._findSection(station.roadSectionId);
      if (section) {
        obj.roadSection = section;
        section.stations.push(obj);
      }
    }

    return obj;
  }

  public removeStation(id: StationId): void {
    const station = this.state.stations.get(id);
    if (!station) return;

    if (station.roadSection) {
      station.roadSection.stations = station.roadSection.stations.filter(s => s.id !== id);
    }

    for (const line of this.state.lines.values()) {
      line.paths = line.paths.filter(p => !(p.kind === 'station-stop' && p.station.id === id));
      this._reindexLinePaths(line);
    }

    this.state.stations.delete(id);
  }

  public updateStationFigmaNodeId(id: StationId, figmaNodeId: string): void {
    const station = this.state.stations.get(id);
    if (station) station.figmaNodeId = figmaNodeId;
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

  public updateLineName(id: LineId, name: string): void {
    const line = this.state.lines.get(id);
    if (line) line.name = name;
  }

  public updateLineColor(id: LineId, color: string): void {
    const line = this.state.lines.get(id);
    if (line) line.color = color;
  }

  public updateLineStackingOrder(newOrder: LineId[]): void {
    this.state.lineStackingOrder = [...newOrder];
  }

  public updateLineFigmaGroupId(id: LineId, figmaGroupId: string): void {
    const line = this.state.lines.get(id);
    if (line) line.figmaGroupId = figmaGroupId;
  }

  // ─── LinePath ───

  public addLinePath(lineId: LineId, path: LinePathInput): void {
    const line = this.state.lines.get(lineId);
    if (!line) return;
    const index = line.paths.length;
    if (path.kind === 'station-stop') {
      const station = this.state.stations.get(path.stationId);
      if (!station) return;
      line.paths.push({ kind: 'station-stop', index, station, rank: this._nextRankForStation(path.stationId), stops: true });
    } else {
      const node = this.state.nodes.get(path.nodeId);
      if (!node) return;
      const exiting = path.exiting ? this._findSection(path.exiting) : null;
      const entering = path.entering ? this._findSection(path.entering) : null;
      const exitRank = this._nextRankForSection(path.nodeId, path.exiting);
      const enterRank = this._nextRankForSection(path.nodeId, path.entering);
      line.paths.push({ kind: 'road-section-change', index, node, exiting, entering, exitRank, enterRank });
    }
    line.paths = validateLinePaths(line);
  }

  private _nextRankForSection(nodeId: NodeId, sectionId: RoadSectionId | null): number {
    let max = -1;
    for (const { path: p } of getRscEntriesForNode(nodeId, this.state)) {
      if (p.exiting?.id === sectionId) max = Math.max(max, p.exitRank);
      if (p.entering?.id === sectionId) max = Math.max(max, p.enterRank);
    }
    return max + 1;
  }

  private _nextRankForStation(stationId: StationId): number {
    let max = -1;
    for (const { path: p } of getStationStopsAcrossLines(stationId, this.state)) {
      if (p.stops) max = Math.max(max, p.rank);
    }
    return max + 1;
  }

  public updateStationStopRanks(
    stationId: StationId,
    stops: Array<{ lineId: LineId; pathIndex: number; rank: number }>
  ): void {
    for (const { lineId, pathIndex, rank } of stops) {
      const line = this.state.lines.get(lineId);
      if (!line) continue;
      const path = line.paths.find(p => p.index === pathIndex);
      if (path?.kind === 'station-stop' && path.station.id === stationId) {
        path.rank = rank;
      }
    }
  }

  public updateRscRanks(
    nodeId: NodeId,
    changes: Array<{ lineId: LineId; pathIndex: number; exitRank: number; enterRank: number }>
  ): void {
    for (const { lineId, pathIndex, exitRank, enterRank } of changes) {
      const line = this.state.lines.get(lineId);
      if (!line) continue;
      const path = line.paths.find(p => p.index === pathIndex);
      if (path?.kind === 'road-section-change' && path.node.id === nodeId) {
        path.exitRank = exitRank;
        path.enterRank = enterRank;
      }
    }
  }

  public fixStationRankConflicts(stationId: StationId): void {
    const stops = getStationStopsAcrossLines(stationId, this.state)
      .filter(({ path }) => path.stops)
      .map(({ line, path }) => ({ path, lineId: line.id }));
    stops.sort((a, b) => {
      if (a.path.rank !== b.path.rank) return a.path.rank - b.path.rank;
      if (a.lineId !== b.lineId) return a.lineId < b.lineId ? -1 : 1;
      return a.path.index - b.path.index;
    });
    stops.forEach(({ path }, i) => { path.rank = i; });
  }

  public setStationStopFlag(lineId: LineId, pathIndex: number, stops: boolean): void {
    const line = this.state.lines.get(lineId);
    if (!line) return;
    const path = line.paths.find(p => p.index === pathIndex);
    if (!path || path.kind !== 'station-stop') return;
    if (stops) {
      path.stops = true;
      line.paths = validateLinePaths(line);
    } else {
      line.paths = line.paths.filter(p => p.index !== pathIndex);
      this._reindexLinePaths(line);
      line.paths = validateLinePaths(line);
    }
  }

  public removeLinePath(lineId: LineId, pathIndex: number): void {
    const line = this.state.lines.get(lineId);
    if (!line) return;
    line.paths = line.paths.filter(p => p.index !== pathIndex);
    this._reindexLinePaths(line);
    line.paths = validateLinePaths(line);
  }

  public replaceLinePaths(lineId: LineId, paths: LinePathInput[]): void {
    const line = this.state.lines.get(lineId);
    if (!line) return;
    const existingStationRanks = new Map<StationId, number>();
    const existingRscRanks = new Map<string, { exitRank: number; enterRank: number }>();
    for (const p of line.paths) {
      if (p.kind === 'station-stop') existingStationRanks.set(p.station.id, p.rank);
      if (p.kind === 'road-section-change') {
        existingRscRanks.set(`${p.node.id}:${p.exiting?.id ?? null}:${p.entering?.id ?? null}`, { exitRank: p.exitRank, enterRank: p.enterRank });
      }
    }
    const newPaths: typeof line.paths = [];
    for (let i = 0; i < paths.length; i++) {
      const p = paths[i];
      if (p.kind === 'station-stop') {
        const station = this.state.stations.get(p.stationId);
        if (!station) continue;
        newPaths.push({ kind: 'station-stop', index: i, station, rank: existingStationRanks.get(p.stationId) ?? 0, stops: true });
      } else {
        const node = this.state.nodes.get(p.nodeId);
        if (!node) continue;
        const exiting = p.exiting ? this._findSection(p.exiting) : null;
        const entering = p.entering ? this._findSection(p.entering) : null;
        const existing = existingRscRanks.get(`${p.nodeId}:${p.exiting ?? null}:${p.entering ?? null}`);
        newPaths.push({ kind: 'road-section-change', index: i, node, exiting, entering, exitRank: existing?.exitRank ?? 0, enterRank: existing?.enterRank ?? 0 } as RoadSectionChange);
      }
    }
    line.paths = newPaths;
    line.paths = validateLinePaths(line);
  }

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

  public getLineStackingOrderForStation(stationId: StationId): LineId[] {
    const lineIds = new Set(getStationStopsAcrossLines(stationId, this.state).map(e => e.line.id));
    return this.state.lineStackingOrder.filter(id => lineIds.has(id));
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
