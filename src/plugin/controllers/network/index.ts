import { NodeId, RoadId } from "@/common/types";
import { LineAtNodeData, NetworkFocusedElement, NodeData, NodePatch, RoadData, RoadPatch, RoadSectionData, UIToPluginMessage } from "@/common/messages";
import { PluginSessionManager } from "../../sessions/manager";
import { postMessageToUI } from "../../figma";
import { Model } from "../../models";
import { View } from "../../views";
import { BaseController } from "../base";
import { NodeChangeListener } from "../listener";
import { UIMessageRouter } from "../router";
import { FIGMA_KEY_IS_ROAD_CONTROL, FIGMA_KEY_NODE_ID, FIGMA_KEY_IS_NODE_MARKER, FIGMA_KEY_ROAD_ID, FIGMA_KEY_JUNCTION_OFFSET_X, FIGMA_KEY_JUNCTION_OFFSET_Y } from "../../views/road";
import { RoadControlManager, FIGMA_KEY_BEZIER_HANDLE, FIGMA_KEY_ENDPOINT_HANDLE } from "./road-control";
import { RoadCreationStateMachine } from "./road-creation";
import { AddingRsePluginSession } from "../../sessions/adding-rse";
import { AddingRoadPluginSession } from "../../sessions/adding-road";
import { getRscEntriesForNode } from "../../utils/line-queries";


export class NetworkController extends BaseController {
  private readonly roadControl: RoadControlManager;
  private readonly roadCreation: RoadCreationStateMachine;
  private isRendering = false;
  private renderDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private isAddingRseMode = false;
  private readonly nodePositionCache = new Map<NodeId, { x: number; y: number }>();

  constructor(model: Model, view: View, listener: NodeChangeListener, sessionManager: PluginSessionManager) {
    super(model, view, listener, sessionManager);
    this.roadControl  = new RoadControlManager(model);
    this.roadCreation = new RoadCreationStateMachine();
  }

  public registerMessages(router: UIMessageRouter): void {
    router.register('add-node', msg => this.handleAddNode(msg));
    router.register('remove-node', msg => this.handleRemoveNode(msg.nodeId));
    router.register('patch-node', msg => this.handlePatchNode(msg.nodeId, msg.patch));
    router.register('start-adding-road-mode', () => this.startRoadCreationSession());
    router.register('remove-road', msg => this.handleRemoveRoad(msg.roadId));
    router.register('patch-road', msg => this.handlePatchRoad(msg.roadId, msg.patch));
    router.register('start-adding-rse-mode', async () => this.startAddingRseSession());
  }

  public async handleAddNode(msg: Extract<UIToPluginMessage, { type: 'add-node' }>): Promise<void> {
    const pos = msg.node.pos ?? figma.viewport.center;
    console.log(`[handleAddNode] pos =`, pos);
    const node = this.model.addNode({ name: msg.node.name, isolatedPos: pos });
    this.nodePositionCache.set(node.id, pos);
    this.isRendering = true;
    try { await this.render(); await this.save(); } finally { this.isRendering = false; }
    this.syncNetworkToUI();
  }

  public async handlePatchNode(nodeId: NodeId, patch: NodePatch): Promise<void> {
    switch (patch.op) {
      case 'update-name':
        this.model.updateNodeName(nodeId, patch.name);
        await this.save();
        this.syncNetworkToUI();
        break;
      case 'update-rsc-ranks':
        this.model.updateRscRanks(nodeId, patch.changes);
        await this.render();
        await this.save();
        this.emitNodeLinesData(nodeId);
        break;
    }
  }

  public async handleRemoveNode(nodeId: NodeId): Promise<void> {
    this.nodePositionCache.delete(nodeId);
    this.model.removeNode(nodeId);
    await this.save();
    this.syncNetworkToUI();
  }

  public async handleRemoveRoad(roadId: RoadId): Promise<void> {
    this.model.removeRoad(roadId);
    await this.save();
    this.syncNetworkToUI();
  }

  public async handlePatchRoad(roadId: RoadId, patch: RoadPatch): Promise<void> {
    switch (patch.op) {
      case 'add-section':
        this.model.addRoadSection(roadId, { ...patch.section });
        break;
      case 'remove-section':
        this.model.removeRoadSection(roadId, patch.sectionId);
        break;
    }
    await this.save();
    this.syncNetworkToUI();
  }

  private async startRoadCreationSession(): Promise<void> {
    this.roadCreation.start();
    this.sessionManager.create(new AddingRoadPluginSession(
      async () => this.roadCreation.cancel()
    ));
  }

  private async startAddingRseSession(): Promise<void> {
    this.isAddingRseMode = true;
    this.sessionManager.create(new AddingRsePluginSession(
      () => { this.isAddingRseMode = false; }
    ));
  }

  public async handleSelectionChange(): Promise<void> {
    const selection = figma.currentPage.selection;
    const first = selection[0];

    if (this.roadCreation.isActive) {
      if (first) {
        const nodeId = first.getPluginData(FIGMA_KEY_NODE_ID) as NodeId;
        if (nodeId) {
          await this.roadCreation.handleNodeClick(nodeId, this.model, (id) => this.getNodeCenter(id), async () => {
            this.isRendering = true;
            try { await this.render(); await this.save(); } finally { this.isRendering = false; }
            this.syncNetworkToUI();
          });
          return;
        }
      }
      this.roadCreation.cancel();
      return;
    }

    if (selection.length === 0) {
      await this.clearNetworkFocus();
      return;
    }

    if (this.isAddingRseMode) {
      const roadId = first.getPluginData(FIGMA_KEY_ROAD_ID) as RoadId;
      if (roadId) postMessageToUI({ type: 'road-clicked', roadId });
      return;
    }

    if (first.getPluginData(FIGMA_KEY_IS_ROAD_CONTROL) === 'true') {
      const roadId = first.getPluginData(FIGMA_KEY_ROAD_ID) as RoadId;
      if (roadId) postMessageToUI({ type: 'network-element-focused', element: this.buildRoadElement(roadId) });
      return;
    }

    const nodeId = first.getPluginData(FIGMA_KEY_NODE_ID) as NodeId;
    if (nodeId) {
      await this.roadControl.remove();
      postMessageToUI({ type: 'network-element-focused', element: this.buildNodeElement(nodeId) });
      this.emitNodeLinesData(nodeId);
      return;
    }

    const roadId = first.getPluginData(FIGMA_KEY_ROAD_ID) as RoadId;
    if (roadId) {
      await this.roadControl.activate(roadId);
      postMessageToUI({ type: 'network-element-focused', element: this.buildRoadElement(roadId) });
      return;
    }

    await this.clearNetworkFocus();
  }

  public async handleDocumentChange(event: DocumentChangeEvent): Promise<void> {
    if (this.isRendering || this.view.isRendering) return;
    const suppressThisBatch = this.roadControl.suppressNextControlChanges;
    this.roadControl.suppressNextControlChanges = false;

    for (const change of event.documentChanges) {
      if (change.type !== 'PROPERTY_CHANGE') continue;
      if (!change.properties.includes('x') && !change.properties.includes('y')) continue;
      if (suppressThisBatch && this.roadControl.isControlElement(change.id)) continue;

      const figmaNode = await figma.getNodeByIdAsync(change.id);
      if (!figmaNode || figmaNode.removed) continue;

      const nodeId = figmaNode.getPluginData(FIGMA_KEY_NODE_ID) as NodeId;
      if (nodeId) {
        if (figmaNode.getPluginData(FIGMA_KEY_IS_NODE_MARKER) === 'true') {
          const frame = figmaNode as FrameNode;
          await this.onNodePositionChanged(nodeId, { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 });
          return;
        }
        if (figmaNode.type === 'FRAME') {
          const frame = figmaNode as FrameNode;
          const ox = Number.parseFloat(frame.getPluginData(FIGMA_KEY_JUNCTION_OFFSET_X) || '0');
          const oy = Number.parseFloat(frame.getPluginData(FIGMA_KEY_JUNCTION_OFFSET_Y) || '0');
          await this.onNodePositionChanged(nodeId, { x: frame.x + ox, y: frame.y + oy });
          return;
        }
      }

      const endpointSide = figmaNode.getPluginData(FIGMA_KEY_ENDPOINT_HANDLE) as 'start' | 'end' | '';
      if (endpointSide) {
        const endpointRoadId = figmaNode.getPluginData(FIGMA_KEY_ROAD_ID) as RoadId;
        if (endpointRoadId) {
          await this.roadControl.onEndpointHandleMoved(endpointRoadId, endpointSide, figmaNode as FrameNode);
          return;
        }
      }

      const isMidBezier = figmaNode.getPluginData(FIGMA_KEY_BEZIER_HANDLE) === 'mid';
      if (!isMidBezier) continue;

      const roadId = figmaNode.getPluginData(FIGMA_KEY_ROAD_ID) as RoadId;
      if (roadId) {
        await this.roadControl.onBezierHandleMoved(roadId, figmaNode as FrameNode);
        return;
      }
    }
  }

  public cleanup(): void {
    if (this.renderDebounceTimer !== null) {
      clearTimeout(this.renderDebounceTimer);
      this.renderDebounceTimer = null;
    }
    this.roadControl.cleanup();
  }

  public syncNetworkToUI(): void {
    postMessageToUI({ type: 'network-data', ...this.buildNetworkPayload() });
  }

  private buildNetworkPayload(): { nodes: NodeData[]; roads: RoadData[] } {
    const state = this.model.getState();
    const nodes: NodeData[] = Array.from(state.nodes.values()).map(n => ({
      id: n.id, name: n.name, pos: this.getNodeCenter(n.id),
    }));
    const roads: RoadData[] = Array.from(state.roads.values()).map(r => ({
      id: r.id,
      name: r.name,
      startNodeId: r.startNode.id,
      endNodeId: r.endNode.id,
      sections: Array.from(r.sections.values()).map((s): RoadSectionData => ({
        id: s.id, name: s.name, index: s.index,
      })),
    }));
    return { nodes, roads };
  }

  private async onNodePositionChanged(nodeId: NodeId, newPos: { x: number; y: number }): Promise<void> {
    const currentCenter = this.getNodeCenter(nodeId);
    const delta = { x: newPos.x - currentCenter.x, y: newPos.y - currentCenter.y };
    if (Math.abs(delta.x) < 0.5 && Math.abs(delta.y) < 0.5) return;
    const node = this.model.getState().nodes.get(nodeId);
    if (node && node.roadConnections.length > 0) {
      this.model.moveNodeConnections(nodeId, delta);
    } else {
      this.nodePositionCache.set(nodeId, newPos);
      this.model.updateIsolatedNodePos(nodeId, newPos);
    }
    await this.roadControl.remove();

    if (this.renderDebounceTimer !== null) clearTimeout(this.renderDebounceTimer);
    this.renderDebounceTimer = setTimeout(async () => {
      this.renderDebounceTimer = null;
      this.isRendering = true;
      try { await this.render(); await this.save(); } finally { this.isRendering = false; }
      this.syncNetworkToUI();
      postMessageToUI({ type: 'network-element-focused', element: this.buildNodeElement(nodeId) });
    }, 500);
  }

  private async clearNetworkFocus(): Promise<void> {
    if (this.renderDebounceTimer !== null) {
      clearTimeout(this.renderDebounceTimer);
      this.renderDebounceTimer = null;
    }
    const wasEditingRoad = this.roadControl.activeRoadId !== null;
    await this.roadControl.remove();
    if (wasEditingRoad) {
      this.isRendering = true;
      try { await this.render(); await this.save(); } finally { this.isRendering = false; }
    }
    postMessageToUI({ type: 'network-selection-cleared' });
  }

  private getNodeCenter(nodeId: NodeId): { x: number; y: number } {
    const node = this.model.getState().nodes.get(nodeId);
    if (node) {
      let sumX = 0, sumY = 0, count = 0;
      for (const { road, endpointIndex } of node.roadConnections) {
        sumX += road.endpoints[endpointIndex].endpointPos.x;
        sumY += road.endpoints[endpointIndex].endpointPos.y;
        count++;
      }
      if (count > 0) return { x: sumX / count, y: sumY / count };
      if (node.isolatedPos) return node.isolatedPos;
    }
    return this.nodePositionCache.get(nodeId) ?? { x: 0, y: 0 };
  }

  private buildNodeElement(nodeId: NodeId): NetworkFocusedElement {
    const node = this.model.getState().nodes.get(nodeId);
    return { kind: 'node', nodeId, name: node?.name, pos: this.getNodeCenter(nodeId) };
  }

  public emitNodeLinesData(nodeId: NodeId): void {
    const state = this.model.getState();
    const node = state.nodes.get(nodeId);
    if (!node) return;
    const lines: LineAtNodeData[] = getRscEntriesForNode(node, state).map(({ line, path: p }) => ({
      lineId: line.id, lineName: line.name, lineColor: line.color, pathIndex: p.index,
      exitingSectionId: p.exiting?.id ?? null, enteringSectionId: p.entering?.id ?? null,
      exitRank: p.exitRank, enterRank: p.enterRank,
    }));
    postMessageToUI({ type: 'node-lines-data', nodeId, lines });
  }

  private buildRoadElement(roadId: RoadId): NetworkFocusedElement {
    const road = this.model.getState().roads.get(roadId);
    if (!road) return { kind: 'road', roadId, startNodeId: '' as NodeId, endNodeId: '' as NodeId, sections: [] };
    return {
      kind: 'road',
      roadId,
      name: road.name,
      startNodeId: road.startNode.id,
      endNodeId: road.endNode.id,
      sections: Array.from(road.sections.values()).map(s => ({
        id: s.id, name: s.name, index: s.index,
      })),
    };
  }
}
