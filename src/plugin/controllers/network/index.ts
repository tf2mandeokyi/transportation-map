import { NodeId, RoadId } from "@/common/types";
import { NetworkFocusedElement, NodeData, RoadData, RoadSectionData, UIToPluginMessage } from "@/common/messages";
import { postMessageToUI } from "../../figma";
import { Model } from "../../models";
import { View } from "../../views";
import { BaseController } from "../base";
import { FIGMA_KEY_IS_ROAD_CONTROL, FIGMA_KEY_NODE_ID, FIGMA_KEY_ROAD_ID, NODE_RADIUS } from "../../views/road";
import { RoadControlManager, FIGMA_KEY_BEZIER_HANDLE, FIGMA_KEY_ENDPOINT_HANDLE } from "./road-control";
import { RoadCreationStateMachine } from "./road-creation";

function buildNetworkPayload(model: Model): { nodes: NodeData[]; roads: RoadData[] } {
  const state = model.getState();
  const nodes: NodeData[] = Array.from(state.nodes.values()).map(n => ({
    id: n.id, name: n.name, pos: n.pos,
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

export class NetworkController extends BaseController {
  private readonly roadControl: RoadControlManager;
  private readonly roadCreation: RoadCreationStateMachine;
  private isRendering = false;
  private renderDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(model: Model, view: View) {
    super(model, view);
    this.roadControl  = new RoadControlManager(model);
    this.roadCreation = new RoadCreationStateMachine();
  }

  // ── Public message handlers (node/road CRUD) ────────────────────────────

  public async handleAddNode(msg: Extract<UIToPluginMessage, { type: 'add-node' }>): Promise<void> {
    this.model.addNode({ name: msg.node.name, pos: msg.node.pos, roadConnections: [] });
    await this.save();
    this.syncNetworkToUI();
  }

  public async handleRemoveNode(nodeId: NodeId): Promise<void> {
    this.model.removeNode(nodeId);
    await this.save();
    this.syncNetworkToUI();
  }

  public async handleAddRoad(msg: Extract<UIToPluginMessage, { type: 'add-road' }>): Promise<void> {
    this.model.addRoad({
      name: msg.road.name,
      startNodeId: msg.road.startNodeId,
      endNodeId: msg.road.endNodeId,
      endpoints: msg.road.endpoints,
      sections: new Map(),
    });
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
          await this.roadCreation.handleNodeClick(nodeId, this.model, async () => {
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
      if (nodeId && figmaNode.type === 'ELLIPSE') {
        await this.onNodeMarkerMoved(nodeId, figmaNode as EllipseNode);
        return;
      }

      const endpointSide = figmaNode.getPluginData(FIGMA_KEY_ENDPOINT_HANDLE) as 'start' | 'end' | '';
      if (endpointSide) {
        const endpointRoadId = figmaNode.getPluginData(FIGMA_KEY_ROAD_ID) as RoadId;
        if (endpointRoadId) {
          await this.roadControl.onEndpointHandleMoved(endpointRoadId, endpointSide, figmaNode as EllipseNode);
          return;
        }
      }

      const handleSide = figmaNode.getPluginData(FIGMA_KEY_BEZIER_HANDLE) as 'start' | 'end' | '';
      if (!handleSide) continue;

      const roadId = figmaNode.getPluginData(FIGMA_KEY_ROAD_ID) as RoadId;
      if (roadId) {
        await this.roadControl.onBezierHandleMoved(roadId, handleSide, figmaNode as EllipseNode);
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
    postMessageToUI({ type: 'network-data', ...buildNetworkPayload(this.model) });
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  private async onNodeMarkerMoved(nodeId: NodeId, ellipse: EllipseNode): Promise<void> {
    const newPos = { x: ellipse.x + NODE_RADIUS, y: ellipse.y + NODE_RADIUS };
    this.model.updateNodePosition(nodeId, newPos);
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

  private buildNodeElement(nodeId: NodeId): NetworkFocusedElement {
    const node = this.model.getState().nodes.get(nodeId);
    return { kind: 'node', nodeId, name: node?.name, pos: node?.pos ?? { x: 0, y: 0 } };
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
