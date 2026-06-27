import { NodeId, RoadId } from "@/common/types";
import { LineAtNodeData, NetworkFocusedElement, NodeData, NodePatch, RoadData, RoadPatch, RoadSectionData } from "@/common/messages";
import { PluginSessionManager } from "../../sessions/manager";
import { postMessageToUI } from "../../figma";
import { Node, RoadSectionChange } from "../../models/structures";
import { Model } from "../../models";
import { View } from "../../views";
import { own } from "@/common/utils/ownership";
import { BaseController } from "../base";
import { NodeChangeListener } from "../listener";
import { UIMessageRouter } from "../router";
import { FIGMA_KEY_IS_ROAD_CONTROL, FIGMA_KEY_NODE_ID, FIGMA_KEY_IS_NODE_MARKER, FIGMA_KEY_ROAD_ID, FIGMA_KEY_JUNCTION_OFFSET_X, FIGMA_KEY_JUNCTION_OFFSET_Y } from "../../views/road";
import { RoadControlManager, FIGMA_KEY_BEZIER_HANDLE, FIGMA_KEY_ENDPOINT_HANDLE } from "./road-control";
import { RoadPlacingState } from "./road-placing";
import { AddingRsePluginSession } from "../../sessions/adding-rse";
import { AddingRoadPluginSession } from "../../sessions/adding-road";
import { getRscEntriesForNode } from "../../utils/line-queries";


export class NetworkController extends BaseController {
  private readonly roadControl: RoadControlManager;
  private readonly roadPlacing = new RoadPlacingState();
  private isRendering = false;
  private renderDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private isAddingRseMode = false;

  constructor(model: Model, view: View, listener: NodeChangeListener, sessionManager: PluginSessionManager) {
    super(model, view, listener, sessionManager);
    this.roadControl = new RoadControlManager(model);
  }

  public registerMessages(router: UIMessageRouter): void {
    router.register('remove-node', msg => this.handleRemoveNode(msg.nodeId));
    router.register('patch-node', msg => this.handlePatchNode(msg.nodeId, msg.patch));
    router.register('start-adding-road-mode', () => this.startRoadCreationSession());
    router.register('remove-road', msg => this.handleRemoveRoad(msg.roadId));
    router.register('patch-road', msg => this.handlePatchRoad(msg.roadId, msg.patch));
    router.register('start-adding-rse-mode', async () => this.startAddingRseSession());
  }

  public async handlePatchNode(nodeId: NodeId, patch: NodePatch): Promise<void> {
    const node = this.model.state.getNode(nodeId);
    switch (patch.op) {
      case 'update-name':
        node?.updateName(patch.name);
        await this.save();
        this.syncNetworkToUI();
        break;
      case 'update-rsc-ranks':
        if (node) node.updateRscRanks(patch.changes);
        if (node) await this.emitNodeLinesData(node);
        await this.render();
        await this.save();
        break;
    }
  }

  public async handleRemoveNode(nodeId: NodeId): Promise<void> {
    const node = this.model.state.getNode(nodeId);
    if (node) this.model.removeNode(node);
    await this.save();
    this.syncNetworkToUI();
  }

  public async handleRemoveRoad(roadId: RoadId): Promise<void> {
    const road = this.model.state.getRoad(roadId);
    if (!road) return;
    this.model.removeRoad(road);
    await this.save();
    this.syncNetworkToUI();
  }

  public async handlePatchRoad(roadId: RoadId, patch: RoadPatch): Promise<void> {
    const road = this.model.state.getRoad(roadId);
    switch (patch.op) {
      case 'add-section':
        if (road) this.model.addRoadSection(road, { ...patch.section });
        break;
      case 'remove-section': {
        const section = road?.hasSection(patch.sectionId[1]) ? road.getSectionHarsh(patch.sectionId[1]) : undefined;
        if (section) this.model.removeRoadSection(section);
        break;
      }
    }
    await this.save();
    this.syncNetworkToUI();
  }

  private async startRoadCreationSession(): Promise<void> {
    await this.roadPlacing.begin(this.model, this.listener);
    this.sessionManager.create(new AddingRoadPluginSession(
      () => this.confirmRoadPlacing(),
      () => this.cancelRoadPlacing(),
    ));
  }

  private async confirmRoadPlacing(): Promise<void> {
    const result = this.roadPlacing.getResult();
    await this.roadPlacing.cleanup();

    if (result) {
      const startNode = result.startNode ?? this.model.addNode({});
      const endNode   = result.endNode   ?? this.model.addNode({});

      this.model.addRoad({
        name: undefined,
        bezierMidPoint: result.bezierPos,
        endpoints: [
          own({ node: startNode, endpointPos: result.startPos, groupNumber: 0 }),
          own({ node: endNode,   endpointPos: result.endPos,   groupNumber: 0 }),
        ],
      });

      this.isRendering = true;
      try { await this.render(); await this.save(); } finally { this.isRendering = false; }
      this.syncNetworkToUI();
    }

    postMessageToUI({ type: 'road-creation-exited' });
  }

  private async cancelRoadPlacing(): Promise<void> {
    await this.roadPlacing.cleanup();
    postMessageToUI({ type: 'road-creation-exited' });
  }

  private async startAddingRseSession(): Promise<void> {
    this.isAddingRseMode = true;
    this.sessionManager.create(new AddingRsePluginSession(
      () => { this.isAddingRseMode = false; }
    ));
  }

  public async handleSelectionChange(): Promise<void> {
    if (this.roadPlacing.isActive) return;

    const selection = figma.currentPage.selection;
    const first = selection[0];

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
      const node = this.model.state.getNode(nodeId);
      if (node) await this.emitNodeLinesData(node);
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
    const state = this.model.state;
    const nodes: NodeData[] = [...state.getNodes()].map(n => ({
      id: n.id, name: n.name, pos: n.getCenter(),
    }));
    const roads: RoadData[] = [...state.getRoads()].map(r => ({
      id: r.id,
      name: r.name,
      startNodeId: r.endpoints[0].node.id,
      endNodeId: r.endpoints[1].node.id,
      sections: [...r.getSections()].map((s): RoadSectionData => ({
        id: s.getRoadSectionId(), name: s.name, index: s.index,
      })),
    }));
    return { nodes, roads };
  }

  private async onNodePositionChanged(nodeId: NodeId, newPos: { x: number; y: number }): Promise<void> {
    const node = this.model.state.getNode(nodeId);
    if (!node) return;
    const currentCenter = node.getCenter();
    const delta = { x: newPos.x - currentCenter.x, y: newPos.y - currentCenter.y };
    if (Math.abs(delta.x) < 0.5 && Math.abs(delta.y) < 0.5) return;
    if (node && node.roadConnections.length > 0) {
      this.model.moveNodeConnections(node, delta);
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

  private buildNodeElement(nodeId: NodeId): NetworkFocusedElement {
    const node = this.model.state.getNode(nodeId);
    return {
      kind: 'node', nodeId, name: node?.name,
      pos: node?.getCenter() ?? { x: 0, y: 0 }
    };
  }

  public async emitNodeLinesData(node: Node): Promise<void> {
    const state = this.model.state;
    const entries = getRscEntriesForNode(node, state);

    type ArmEntry = { rsc: RoadSectionChange; role: 'exit' | 'enter'; rank: number; lineId: string; pathIndex: number };
    const sectionGroups = new Map<string, ArmEntry[]>();
    for (const { line, path: rsc } of entries) {
      if (rsc.exiting) {
        const key = rsc.exiting.section.id;
        const g = sectionGroups.get(key) ?? [];
        g.push({ rsc, role: 'exit', rank: rsc.exitRank, lineId: line.id, pathIndex: rsc.index });
        sectionGroups.set(key, g);
      }
      if (rsc.entering) {
        const key = rsc.entering.section.id;
        const g = sectionGroups.get(key) ?? [];
        g.push({ rsc, role: 'enter', rank: rsc.enterRank, lineId: line.id, pathIndex: rsc.index });
        sectionGroups.set(key, g);
      }
    }

    let changed = false;
    for (const group of sectionGroups.values()) {
      group.sort((a, b) => {
        if (a.rank !== b.rank) return a.rank - b.rank;
        if (a.lineId !== b.lineId) return a.lineId < b.lineId ? -1 : 1;
        return a.pathIndex - b.pathIndex;
      });
      group.forEach((item, i) => {
        if (item.role === 'exit' && item.rsc.exitRank !== i) { item.rsc.exitRank = i; changed = true; }
        if (item.role === 'enter' && item.rsc.enterRank !== i) { item.rsc.enterRank = i; changed = true; }
      });
    }

    if (changed) await this.save();

    const lines: LineAtNodeData[] = entries.map(({ line, path: p }) => ({
      lineId: line.id, lineName: line.name, lineColor: line.color, pathIndex: p.index,
      exitingSectionId: p.exiting?.section.getRoadSectionId() ?? null,
      enteringSectionId: p.entering?.section.getRoadSectionId() ?? null,
      exitRank: p.exitRank, enterRank: p.enterRank,
    }));
    postMessageToUI({ type: 'node-lines-data', nodeId: node.id, lines });
  }

  private buildRoadElement(roadId: RoadId): NetworkFocusedElement {
    const road = this.model.state.getRoad(roadId);
    if (!road) return { kind: 'road', roadId, startNodeId: '' as NodeId, endNodeId: '' as NodeId, sections: [] };
    return {
      kind: 'road',
      roadId,
      name: road.name,
      startNodeId: road.endpoints[0].node.id,
      endNodeId: road.endpoints[1].node.id,
      sections: [...road.getSections()].map(s => ({
        id: s.getRoadSectionId(), name: s.name, index: s.index,
      })),
    };
  }
}
