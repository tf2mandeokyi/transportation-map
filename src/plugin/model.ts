import { Line, MapState, Station } from "./structures";
import { deserializeMapState, serializeMapState } from "./serde";
import { LineId, StationId, StationOrientation } from "../common/types";

function generateBase62(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function generateUniqueId<T extends string>(map: Map<T, any>): T {
  let length = 1;
  while (true) {
    const id = generateBase62(length) as T;
    if (!map.has(id)) return id;
    length++;
  }
}

export class Model {
  private state: MapState;
  private rightHandTraffic: boolean = true;

  constructor(initialState?: Partial<MapState>) {
    this.state = {
      stations: initialState?.stations ?? new Map(),
      lines: initialState?.lines ?? new Map(),
      lineStackingOrder: initialState?.lineStackingOrder ?? [],
    };
  }

  public getState(): Readonly<MapState> {
    return this.state;
  }

  public isRightHandTraffic(): boolean {
    return this.rightHandTraffic;
  }

  public setTrafficDirection(rightHand: boolean): void {
    this.rightHandTraffic = rightHand;
  }

  public addStation(station: Omit<Station, 'id' | 'figmaNodeId'>): StationId {
    const id = generateUniqueId(this.state.stations);
    this.state.stations.set(id, { ...station, figmaNodeId: null, id });
    return id;
  }

  public removeStation(id: StationId): void {
    const station = this.state.stations.get(id);
    if (station) {
      // Remove this station from all lines that use it
      for (const line of this.state.lines.values()) {
        const index = line.path.indexOf(id);
        if (index !== -1) {
          line.path.splice(index, 1);
        }
      }
      this.state.stations.delete(id);
    }
  }

  public findStationFromNode(node: SceneNode): Station | null {
    // Recursively traverse up the parent chain to find a station node
    // by checking if the node ID matches any station's figmaNodeId
    let currentNode: BaseNode | null = node;

    while (currentNode && 'id' in currentNode) {
      const station = this.findStationByFigmaId(currentNode.id);
      if (station) {
        return station;
      }
      currentNode = currentNode.parent;
    }

    return null;
  }

  public updateStationFigmaNodeId(id: StationId, figmaNodeId: string): void {
    const station = this.state.stations.get(id);
    if (station) station.figmaNodeId = figmaNodeId;
  }

  public updateStationPosition(id: StationId, newPosition: Vector): void {
    const station = this.state.stations.get(id);
    if (station) station.position = newPosition;
  }

  public setStationHidden(id: StationId, hidden: boolean): void {
    const station = this.state.stations.get(id);
    if (station) station.hidden = hidden;
  }

  public setStationOrientation(id: StationId, orientation: StationOrientation): void {
    const station = this.state.stations.get(id);
    if (station) station.orientation = orientation;
  }

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
    if (index !== -1) {
      this.state.lineStackingOrder.splice(index, 1);
    }

    // Remove line references from all stations
    for (const station of this.state.stations.values()) {
      station.lines.delete(id);
    }
  }

  public addStationToLine(lineId: LineId, stationId: StationId, stopsAt: boolean = true): void {
    const line = this.state.lines.get(lineId);
    const station = this.state.stations.get(stationId);

    if (line && station) {
      // Add station to line path (allowing duplicates for circular routes)
      line.path.push(stationId);

      // Set line info for this station
      station.lines.set(lineId, { stopsAt });
    }
  }

  public removeStationFromLine(lineId: LineId, stationId: StationId): void {
    const line = this.state.lines.get(lineId);
    const station = this.state.stations.get(stationId);

    if (line && station) {
      const index = line.path.indexOf(stationId);
      if (index !== -1) {
        line.path.splice(index, 1);
      }
      station.lines.delete(lineId);
    }
  }

  public setLineStopsAtStation(lineId: LineId, stationId: StationId, stopsAt: boolean): void {
    const station = this.state.stations.get(stationId);
    if (station && station.lines.has(lineId)) {
      station.lines.set(lineId, { stopsAt });
    }
  }

  public updateLineStackingOrder(newOrder: LineId[]): void {
    this.state.lineStackingOrder = [...newOrder];
  }

  public updateLineFigmaGroupId(id: LineId, figmaGroupId: string): void {
    const line = this.state.lines.get(id);
    if (line) line.figmaGroupId = figmaGroupId;
  }

  public findStationByFigmaId(figmaNodeId: string): Station | null {
    for (const station of this.state.stations.values()) {
      if (station.figmaNodeId === figmaNodeId) {
        return station;
      }
    }
    return null;
  }

  public getLineStackingOrderForStation(stationId: StationId): LineId[] {
    const station = this.state.stations.get(stationId);
    if (!station) return [];

    // Filter global stacking order to only include lines that pass through this station
    return this.state.lineStackingOrder.filter(lineId => station.lines.has(lineId));
  }

  public getStackingPosition(stationId: StationId, lineId: LineId, orientation: StationOrientation): { x: number, y: number } {
    const stackOrder = this.getLineStackingOrderForStation(stationId);
    const lineIndex = stackOrder.indexOf(lineId);

    if (lineIndex === -1) return { x: 0, y: 0 };

    const lineSpacing = 8; // Pixels between lines
    const offset = lineIndex * lineSpacing;

    // Calculate position based on station orientation and traffic direction
    switch (orientation) {
      case 'RIGHT':
        return this.rightHandTraffic
          ? { x: 0, y: offset }     // Lines below origin for right-hand traffic
          : { x: 0, y: -offset };   // Lines above origin for left-hand traffic

      case 'LEFT':
        return this.rightHandTraffic
          ? { x: 0, y: -offset }    // Lines above origin for right-hand traffic
          : { x: 0, y: offset };    // Lines below origin for left-hand traffic

      case 'UP':
        return this.rightHandTraffic
          ? { x: offset, y: 0 }     // Lines to the right for right-hand traffic
          : { x: -offset, y: 0 };   // Lines to the left for left-hand traffic

      case 'DOWN':
        return this.rightHandTraffic
          ? { x: -offset, y: 0 }    // Lines to the left for right-hand traffic
          : { x: offset, y: 0 };    // Lines to the right for left-hand traffic

      default:
        return { x: 0, y: 0 };
    }
  }

  // Save the model state to Figma's pluginData (stored in the document)
  public async save(): Promise<void> {
    const serialized = serializeMapState(this.state, this.rightHandTraffic);
    figma.root.setPluginData('mapState', serialized);
  }

  // Load the model state from Figma's pluginData
  public static async load(): Promise<Model | null> {
    const data = figma.root.getPluginData('mapState');
    if (!data) return null;

    const deserialized = deserializeMapState(data);
    if (!deserialized) return null;

    const model = new Model(deserialized.state);
    model.setTrafficDirection(deserialized.rightHandTraffic);

    return model;
  }
}