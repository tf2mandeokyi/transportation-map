import { NodeId } from "@/common/types";
import { postMessageToUI } from "../../figma";
import { Model } from "../../models";
import { Node } from "../../models/structures";

type Mode = 'idle' | 'first-node' | 'second-node';

export class RoadCreationStateMachine {
  private mode: Mode = 'idle';
  private startNode: Node | null = null;

  get isActive(): boolean { return this.mode !== 'idle'; }

  start(): void {
    this.mode = 'first-node';
    this.startNode = null;
  }

  cancel(): void {
    if (this.mode !== 'idle') this.exit();
  }

  // Returns true if the click was consumed by the state machine.
  async handleNodeClick(
    nodeId: NodeId,
    model: Model,
    getNodeCenter: (node: Node) => { x: number; y: number },
    onRoadCreated: () => Promise<void>,
  ): Promise<boolean> {
    if (!this.isActive) return false;

    if (this.mode === 'first-node') {
      const node = model.getState().nodes.get(nodeId);
      if (!node) return false;
      this.startNode = node;
      this.mode = 'second-node';
      postMessageToUI({ type: 'road-creation-first-node', nodeId, name: node.name });
      return true;
    }

    if (this.mode === 'second-node' && this.startNode) {
      const endNode = model.getState().nodes.get(nodeId);
      if (!endNode || endNode === this.startNode) return true;
      const startPos = getNodeCenter(this.startNode);
      const endPos   = getNodeCenter(endNode);
      await this.finishRoadCreation(this.startNode, endNode, startPos, endPos, model, onRoadCreated);
    }
    return true;
  }

  private async finishRoadCreation(
    startNode: Node,
    endNode: Node,
    startPos: { x: number; y: number },
    endPos: { x: number; y: number },
    model: Model,
    onRoadCreated: () => Promise<void>,
  ): Promise<void> {
    model.addRoad({
      name: undefined,
      startNodeId: startNode.id,
      endNodeId: endNode.id,
      bezierMidPoint: { x: (startPos.x + endPos.x) / 2, y: (startPos.y + endPos.y) / 2 },
      endpoints: [
        { endpointPos: startPos, groupNumber: 0 },
        { endpointPos: endPos,   groupNumber: 0 },
      ],
    });
    await onRoadCreated();
    this.exit();
  }

  private exit(): void {
    this.mode = 'idle';
    this.startNode = null;
    postMessageToUI({ type: 'road-creation-exited' });
  }
}
