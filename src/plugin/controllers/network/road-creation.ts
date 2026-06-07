import { NodeId } from "@/common/types";
import { postMessageToUI } from "../../figma";
import { Model } from "../../models";

type Mode = 'idle' | 'first-node' | 'second-node';

export class RoadCreationStateMachine {
  private mode: Mode = 'idle';
  private startNodeId: NodeId | null = null;

  get isActive(): boolean { return this.mode !== 'idle'; }

  start(): void {
    this.mode = 'first-node';
    this.startNodeId = null;
  }

  cancel(): void {
    if (this.mode !== 'idle') this.exit();
  }

  // Returns true if the click was consumed by the state machine.
  async handleNodeClick(
    nodeId: NodeId,
    model: Model,
    getNodeCenter: (nodeId: NodeId) => { x: number; y: number },
    onRoadCreated: () => Promise<void>,
  ): Promise<boolean> {
    if (!this.isActive) return false;

    if (this.mode === 'first-node') {
      this.startNodeId = nodeId;
      this.mode = 'second-node';
      const node = model.getState().nodes.get(nodeId);
      postMessageToUI({ type: 'road-creation-first-node', nodeId, name: node?.name });
      return true;
    }

    if (this.mode === 'second-node' && this.startNodeId && nodeId !== this.startNodeId) {
      const startPos = getNodeCenter(this.startNodeId);
      const endPos   = getNodeCenter(nodeId);
      await this.finishRoadCreation(this.startNodeId, nodeId, startPos, endPos, model, onRoadCreated);
    }
    return true;
  }

  private async finishRoadCreation(
    startNodeId: NodeId,
    endNodeId: NodeId,
    startPos: { x: number; y: number },
    endPos: { x: number; y: number },
    model: Model,
    onRoadCreated: () => Promise<void>,
  ): Promise<void> {
    model.addRoad({
      name: undefined,
      startNodeId,
      endNodeId,
      bezierMidPoint: { x: (startPos.x + endPos.x) / 2, y: (startPos.y + endPos.y) / 2 },
      endpoints: [
        { endpointPos: startPos, groupNumber: 0 },
        { endpointPos: endPos,   groupNumber: 0 },
      ],
      sections: new Map(),
    });
    await onRoadCreated();
    this.exit();
  }

  private exit(): void {
    this.mode = 'idle';
    this.startNodeId = null;
    postMessageToUI({ type: 'road-creation-exited' });
  }
}
