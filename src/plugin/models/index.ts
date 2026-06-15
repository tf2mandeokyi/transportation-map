import { Connection, Line, MapState, Node, Road, RoadSection, Station, StationStop } from "./structures";
import { deserializeMapState, serializeMapState } from "./serde";
import { LineId, NodeId, RoadId, RoadSectionId, StationId } from "@/common/types";
import { LinePathInput } from "@/common/messages";
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
  private readonly state: MapState;

  constructor(initialState?: Partial<MapState>) {
    this.state = {
      nodes: initialState?.nodes ?? new Map(),
      roads: initialState?.roads ?? new Map(),
      stations: initialState?.stations ?? new Map(),
      lines: initialState?.lines ?? new Map(),
      lineStackingOrder: initialState?.lineStackingOrder ?? [],
    };
  }

  public getState(): Readonly<MapState> {
    return this.state;
  }

  // ─── Node ───

  public addNode(node: Omit<Node, 'id'>): NodeId {
    const id = generateUniqueId(this.state.nodes);
    this.state.nodes.set(id, { ...node, id });
    return id;
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
    const roadIds = node.roadConnections.map(rc => rc.roadId);
    for (const roadId of roadIds) {
      this.removeRoad(roadId);
    }
    this.state.nodes.delete(id);
  }

  public moveNodeConnections(id: NodeId, delta: { x: number; y: number }): void {
    const node = this.state.nodes.get(id);
    if (!node) return;
    for (const { roadId, endpointIndex } of node.roadConnections) {
      const road = this.state.roads.get(roadId);
      if (!road) continue;
      const conn = road.endpoints[endpointIndex];
      road.endpoints[endpointIndex] = {
        ...conn,
        endpointPos: { x: conn.endpointPos.x + delta.x, y: conn.endpointPos.y + delta.y },
      };
    }
  }

  // ─── Road ───

  public addRoad(road: Omit<Road, 'id'>): RoadId {
    const id = generateUniqueId(this.state.roads);
    this.state.roads.set(id, { ...road, id });

    const startNode = this.state.nodes.get(road.startNodeId);
    if (startNode) startNode.roadConnections.push({ roadId: id, endpointIndex: 0 });

    const endNode = this.state.nodes.get(road.endNodeId);
    if (endNode) endNode.roadConnections.push({ roadId: id, endpointIndex: 1 });

    return id;
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
      node.roadConnections = node.roadConnections.filter(rc => rc.roadId !== id);
    }

    for (const section of road.sections.values()) {
      const stationIds = [...section.stationIds];
      for (const stationId of stationIds) {
        this.removeStation(stationId);
      }
    }

    this._removeRoadFromLines(id);
    this.state.roads.delete(id);
  }

  // ─── RoadSection ───

  public addRoadSection(roadId: RoadId, section: Omit<RoadSection, 'id'>): RoadSectionId {
    const road = this.state.roads.get(roadId);
    if (!road) throw new Error(`Road ${roadId} not found`);

    // Generate unique ID across all sections of all roads
    const allSectionIds = new Map<RoadSectionId, true>();
    for (const r of this.state.roads.values()) {
      for (const sid of r.sections.keys()) allSectionIds.set(sid, true);
    }
    const id = generateUniqueId(allSectionIds);

    road.sections.set(id, { ...section, id });
    return id;
  }

  public removeRoadSection(roadId: RoadId, sectionId: RoadSectionId): void {
    const road = this.state.roads.get(roadId);
    if (!road) return;

    const section = road.sections.get(sectionId);
    if (section) {
      const stationIds = [...section.stationIds];
      for (const stationId of stationIds) {
        this.removeStation(stationId);
      }
    }

    road.sections.delete(sectionId);
  }

  private _removeRoadFromLines(roadId: RoadId): void {
    for (const line of this.state.lines.values()) {
      line.paths = line.paths.filter(p =>
        !(p.kind === 'road-section-enter' && (p.sourceRoadId === roadId || p.destRoadId === roadId))
      );
      this._reindexLinePaths(line);
    }
  }

  // ─── Station ───

  public addStation(station: Omit<Station, 'id' | 'figmaNodeId'>): StationId {
    const id = generateUniqueId(this.state.stations);
    this.state.stations.set(id, { ...station, figmaNodeId: null, id });

    if (station.roadSectionId) {
      const section = this._findSection(station.roadSectionId);
      if (section) section.stationIds.push(id);
    }

    return id;
  }

  public removeStation(id: StationId): void {
    const station = this.state.stations.get(id);
    if (!station) return;

    if (station.roadSectionId) {
      const section = this._findSection(station.roadSectionId);
      if (section) {
        section.stationIds = section.stationIds.filter(sid => sid !== id);
      }
    }

    for (const line of this.state.lines.values()) {
      line.paths = line.paths.filter(p => !(p.kind === 'station-stop' && p.stationId === id));
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

  public addLine(line: Omit<Line, 'id' | 'figmaGroupId'>): LineId {
    const id = generateUniqueId(this.state.lines);
    this.state.lines.set(id, { ...line, id, figmaGroupId: null });
    if (!this.state.lineStackingOrder.includes(id)) {
      this.state.lineStackingOrder.push(id);
    }
    return id;
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
      line.paths.push({ kind: 'station-stop', index, stationId: path.stationId, rank: this._nextRankForStation(path.stationId) });
    } else {
      line.paths.push({ kind: 'road-section-enter', index, sourceRoadId: path.sourceRoadId, nodeId: path.nodeId, destRoadId: path.destRoadId });
    }
    line.paths = validateLinePaths(line, this.state);
  }

  private _nextRankForStation(stationId: StationId): number {
    let max = -1;
    for (const line of this.state.lines.values()) {
      for (const p of line.paths) {
        if (p.kind === 'station-stop' && p.stationId === stationId) {
          max = Math.max(max, p.rank);
        }
      }
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
      if (path?.kind === 'station-stop' && path.stationId === stationId) {
        path.rank = rank;
      }
    }
  }

  public fixStationRankConflicts(stationId: StationId): void {
    const stops: Array<{ path: StationStop; lineId: LineId }> = [];
    for (const line of this.state.lines.values()) {
      for (const p of line.paths) {
        if (p.kind === 'station-stop' && p.stationId === stationId) {
          stops.push({ path: p, lineId: line.id });
        }
      }
    }
    stops.sort((a, b) => {
      if (a.path.rank !== b.path.rank) return a.path.rank - b.path.rank;
      if (a.lineId !== b.lineId) return a.lineId < b.lineId ? -1 : 1;
      return a.path.index - b.path.index;
    });
    stops.forEach(({ path }, i) => { path.rank = i; });
  }

  public removeLinePath(lineId: LineId, pathIndex: number): void {
    const line = this.state.lines.get(lineId);
    if (!line) return;
    line.paths = line.paths.filter(p => p.index !== pathIndex);
    this._reindexLinePaths(line);
  }

  public replaceLinePaths(lineId: LineId, paths: LinePathInput[]): void {
    const line = this.state.lines.get(lineId);
    if (!line) return;
    const existingRanks = new Map<StationId, number>();
    for (const p of line.paths) {
      if (p.kind === 'station-stop') existingRanks.set(p.stationId, p.rank);
    }
    line.paths = paths.map((p, i) => {
      if (p.kind === 'station-stop') {
        return { kind: 'station-stop', index: i, stationId: p.stationId, rank: existingRanks.get(p.stationId) ?? 0 };
      }
      return { kind: 'road-section-enter', index: i, sourceRoadId: p.sourceRoadId, nodeId: p.nodeId, destRoadId: p.destRoadId };
    });
    line.paths = validateLinePaths(line, this.state);
  }

  public validateAllLinePaths(): void {
    for (const line of this.state.lines.values()) {
      line.paths = validateLinePaths(line, this.state);
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
    return this.state.lineStackingOrder.filter(lineId => {
      const line = this.state.lines.get(lineId);
      return line?.paths.some(p => p.kind === 'station-stop' && p.stationId === stationId);
    });
  }

  // ─── Persistence ───

  public async save(): Promise<void> {
    const serialized = serializeMapState(this.state);
    figma.root.setPluginData('mapState', serialized);
  }

  public static async load(): Promise<Model | null> {
    const data = figma.root.getPluginData('mapState');
    if (!data) return null;

    const state = deserializeMapState(data);
    if (!state) return null;

    return new Model(state);
  }
}
