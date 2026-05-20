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
      await this.finishRoadCreation(this.startNodeId, nodeId, model, onRoadCreated);
    }
    return true;
  }

  private async finishRoadCreation(
    startNodeId: NodeId,
    endNodeId: NodeId,
    model: Model,
    onRoadCreated: () => Promise<void>,
  ): Promise<void> {
    const state = model.getState();
    const start = state.nodes.get(startNodeId);
    const end   = state.nodes.get(endNodeId);
    if (start && end) {
      const dx = end.pos.x - start.pos.x;
      const dy = end.pos.y - start.pos.y;
      model.addRoad({
        name: undefined,
        startNodeId,
        endNodeId,
        endpoints: [
          { endpointDisplacement: { x: 0, y: 0 }, bezierDisplacement: { x: dx / 3, y: dy / 3 }, bezierDirection: { x: dx, y: dy }, groupNumber: 0 },
          { endpointDisplacement: { x: 0, y: 0 }, bezierDisplacement: { x: -dx / 3, y: -dy / 3 }, bezierDirection: { x: -dx, y: -dy }, groupNumber: 0 },
        ],
        sections: new Map(),
      });
      await onRoadCreated();
    }
    this.exit();
  }

  private exit(): void {
    this.mode = 'idle';
    this.startNodeId = null;
    postMessageToUI({ type: 'road-creation-exited' });
  }
}
