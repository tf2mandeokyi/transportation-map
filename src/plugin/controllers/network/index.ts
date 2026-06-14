import { NodeId, RoadId } from "@/common/types";
import { NetworkFocusedElement, NodeData, RoadData, RoadSectionData, UIToPluginMessage } from "@/common/messages";
import { postMessageToUI } from "../../figma";
import { Model } from "../../models";
import { View } from "../../views";
import { BaseController } from "../base";
import { NodeChangeListener } from "../listener";
import { UIMessageRouter } from "../router";
import { FIGMA_KEY_IS_ROAD_CONTROL, FIGMA_KEY_NODE_ID, FIGMA_KEY_ROAD_ID, FIGMA_KEY_JUNCTION_OFFSET_X, FIGMA_KEY_JUNCTION_OFFSET_Y } from "../../views/road";
import { RoadControlManager, FIGMA_KEY_BEZIER_HANDLE, FIGMA_KEY_ENDPOINT_HANDLE } from "./road-control";
import { RoadCreationStateMachine } from "./road-creation";


export class NetworkController extends BaseController {
  private readonly roadControl: RoadControlManager;
  private readonly roadCreation: RoadCreationStateMachine;
  private isRendering = false;
  private renderDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private isAddingRseMode = false;
  // Caches the initial placement position for newly created isolated nodes
  // (nodes with no road connections yet) so road creation can use it.
  private readonly nodePositionCache = new Map<NodeId, { x: number; y: number }>();

  constructor(model: Model, view: View, listener: NodeChangeListener) {
    super(model, view, listener);
    this.roadControl  = new RoadControlManager(model);
    this.roadCreation = new RoadCreationStateMachine();
  }

  public registerMessages(router: UIMessageRouter): void {
    router.register('add-node', msg => this.handleAddNode(msg));
    router.register('update-node-name', msg => this.handleUpdateNodeName(msg.nodeId, msg.name));
    router.register('remove-node', msg => this.handleRemoveNode(msg.nodeId));
    router.register('start-adding-road-mode', () => this.startRoadCreationMode());
    router.register('cancel-adding-road-mode', () => this.cancelRoadCreationMode());
    router.register('remove-road', msg => this.handleRemoveRoad(msg.roadId));
    router.register('add-road-section', msg => this.handleAddRoadSection(msg));
    router.register('remove-road-section', msg => this.handleRemoveRoadSection(msg));
    router.register('start-adding-rse-mode', async () => { this.isAddingRseMode = true; });
    router.register('stop-adding-rse-mode',  async () => { this.isAddingRseMode = false; });
  }

  // ── Public message handlers (node/road CRUD) ────────────────────────────

  public async handleAddNode(msg: Extract<UIToPluginMessage, { type: 'add-node' }>): Promise<void> {
    const pos = msg.node.pos ?? figma.viewport.center;
    console.log(`[handleAddNode] pos =`, pos);
    const id = this.model.addNode({ name: msg.node.name, isolatedPos: pos, roadConnections: [] });
    this.nodePositionCache.set(id, pos);
    this.isRendering = true;
    try { await this.render(); await this.save(); } finally { this.isRendering = false; }
    this.syncNetworkToUI();
  }

  public async handleUpdateNodeName(nodeId: NodeId, name: string | undefined): Promise<void> {
    this.model.updateNodeName(nodeId, name);
    await this.save();
    this.syncNetworkToUI();
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

  public async handleAddRoadSection(msg: Extract<UIToPluginMessage, { type: 'add-road-section' }>): Promise<void> {
    this.model.addRoadSection(msg.roadId, { ...msg.section, stationIds: [] });
    await this.save();
    this.syncNetworkToUI();
  }

  public async handleRemoveRoadSection(msg: Extract<UIToPluginMessage, { type: 'remove-road-section' }>): Promise<void> {
    this.model.removeRoadSection(msg.roadId, msg.sectionId);
    await this.save();
    this.syncNetworkToUI();
  }

  // ── Road creation mode ──────────────────────────────────────────────────

  public async startRoadCreationMode(): Promise<void> {
    this.roadCreation.start();
  }

  public async cancelRoadCreationMode(): Promise<void> {
    this.roadCreation.cancel();
  }

  // ── Figma event entry points ────────────────────────────────────────────

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

    // In RSE mode any road click is reported to the UI; all other interactions are suppressed.
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
        if (figmaNode.type === 'ELLIPSE') {
          await this.onNodeMarkerMoved(nodeId, figmaNode as EllipseNode);
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
          await this.roadControl.onEndpointHandleMoved(endpointRoadId, endpointSide, figmaNode as EllipseNode);
          return;
        }
      }

      const isMidBezier = figmaNode.getPluginData(FIGMA_KEY_BEZIER_HANDLE) === 'mid';
      if (!isMidBezier) continue;

      const roadId = figmaNode.getPluginData(FIGMA_KEY_ROAD_ID) as RoadId;
      if (roadId) {
        await this.roadControl.onBezierHandleMoved(roadId, figmaNode as EllipseNode);
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

  // ── Network sync ────────────────────────────────────────────────────────

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
      startNodeId: r.startNodeId,
      endNodeId: r.endNodeId,
      sections: Array.from(r.sections.values()).map((s): RoadSectionData => ({
        id: s.id, name: s.name, index: s.index,
      })),
    }));
    return { nodes, roads };
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  private async onNodeMarkerMoved(nodeId: NodeId, ellipse: EllipseNode): Promise<void> {
    await this.onNodePositionChanged(nodeId, { x: ellipse.x + ellipse.width / 2, y: ellipse.y + ellipse.height / 2 });
  }

  private async onNodePositionChanged(nodeId: NodeId, newPos: { x: number; y: number }): Promise<void> {
    const currentCenter = this.getNodeCenter(nodeId);
    const delta = { x: newPos.x - currentCenter.x, y: newPos.y - currentCenter.y };
    // Ignore sub-pixel deltas: our own render places nodes at exactly the model
    // position, so the post-render documentchange always produces delta ≈ 0.
    // A real user drag in Figma always moves by at least a pixel.
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
    const state = this.model.getState();
    const node = state.nodes.get(nodeId);
    if (node) {
      let sumX = 0, sumY = 0, count = 0;
      for (const { roadId, endpointIndex } of node.roadConnections) {
        const road = state.roads.get(roadId);
        if (!road) continue;
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

  private buildRoadElement(roadId: RoadId): NetworkFocusedElement {
    const road = this.model.getState().roads.get(roadId);
    if (!road) return { kind: 'road', roadId, startNodeId: '' as NodeId, endNodeId: '' as NodeId, sections: [] };
    return {
      kind: 'road',
      roadId,
      name: road.name,
      startNodeId: road.startNodeId,
      endNodeId: road.endNodeId,
      sections: Array.from(road.sections.values()).map(s => ({
        id: s.id, name: s.name, index: s.index,
      })),
    };
  }
}
