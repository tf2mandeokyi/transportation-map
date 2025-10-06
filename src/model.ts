import { Line, LineId, LineStopInfo, MapState, Node, NodeId, NodeOrientation, Vector } from "./structures";

export class Model {
  private state: MapState;
  private rightHandTraffic: boolean = true;

  constructor(initialState?: Partial<MapState>) {
    this.state = {
      nodes: initialState?.nodes ?? new Map(),
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

  public addNode(node: Node): void {
    this.state.nodes.set(node.id, node);
  }

  public removeNode(id: NodeId): void {
    const node = this.state.nodes.get(id);
    if (node) {
      // Remove this node from all lines that use it
      for (const line of this.state.lines.values()) {
        const index = line.path.indexOf(id);
        if (index !== -1) {
          line.path.splice(index, 1);
        }
      }
      this.state.nodes.delete(id);
    }
  }

  public updateNodePosition(id: NodeId, newPosition: Vector): void {
    const node = this.state.nodes.get(id);
    if (node) {
      node.position = newPosition;
    }
  }

  public setNodeHidden(id: NodeId, hidden: boolean): void {
    const node = this.state.nodes.get(id);
    if (node) {
      node.hidden = hidden;
    }
  }

  public setNodeOrientation(id: NodeId, orientation: NodeOrientation): void {
    const node = this.state.nodes.get(id);
    if (node) {
      node.orientation = orientation;
    }
  }

  public addLine(line: Line): void {
    this.state.lines.set(line.id, line);
    if (!this.state.lineStackingOrder.includes(line.id)) {
      this.state.lineStackingOrder.push(line.id);
    }
  }

  public removeLine(id: LineId): void {
    this.state.lines.delete(id);
    const index = this.state.lineStackingOrder.indexOf(id);
    if (index !== -1) {
      this.state.lineStackingOrder.splice(index, 1);
    }

    // Remove line references from all nodes
    for (const node of this.state.nodes.values()) {
      node.lines.delete(id);
    }
  }

  public addNodeToLine(lineId: LineId, nodeId: NodeId, stopsAt: boolean = true): void {
    const line = this.state.lines.get(lineId);
    const node = this.state.nodes.get(nodeId);

    if (line && node) {
      // Add node to line path if not already there
      if (!line.path.includes(nodeId)) {
        line.path.push(nodeId);
      }

      // Set line info for this node
      node.lines.set(lineId, { stopsAt });
    }
  }

  public removeNodeFromLine(lineId: LineId, nodeId: NodeId): void {
    const line = this.state.lines.get(lineId);
    const node = this.state.nodes.get(nodeId);

    if (line && node) {
      const index = line.path.indexOf(nodeId);
      if (index !== -1) {
        line.path.splice(index, 1);
      }
      node.lines.delete(lineId);
    }
  }

  public setLineStopsAtNode(lineId: LineId, nodeId: NodeId, stopsAt: boolean): void {
    const node = this.state.nodes.get(nodeId);
    if (node && node.lines.has(lineId)) {
      node.lines.set(lineId, { stopsAt });
    }
  }

  public updateLineStackingOrder(newOrder: LineId[]): void {
    this.state.lineStackingOrder = [...newOrder];
  }

  public getLineStackingOrderForNode(nodeId: NodeId): LineId[] {
    const node = this.state.nodes.get(nodeId);
    if (!node) return [];

    // Filter global stacking order to only include lines that pass through this node
    return this.state.lineStackingOrder.filter(lineId => node.lines.has(lineId));
  }

  public getStackingPosition(nodeId: NodeId, lineId: LineId, orientation: NodeOrientation): { x: number, y: number } {
    const stackOrder = this.getLineStackingOrderForNode(nodeId);
    const lineIndex = stackOrder.indexOf(lineId);

    if (lineIndex === -1) return { x: 0, y: 0 };

    const lineSpacing = 8; // Pixels between lines
    const offset = lineIndex * lineSpacing;

    // Calculate position based on node orientation and traffic direction
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
}