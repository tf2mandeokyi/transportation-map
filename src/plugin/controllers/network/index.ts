import { LineId, NodeId, RoadId, RoadSectionId, SectionId } from "@/common/types";
import { LineAtNodeData, LineAtRoadSectionData, NetworkFocusedElement, NodeData, NodePatch, RoadData, RoadPatch, RoadSectionData } from "@/common/messages";
import { PluginSessionManager } from "../../sessions/manager";
import { postMessageToUI } from "../../figma";
import { Line, Node, Road, RoadSectionPass } from "../../models/structures";
import { Model } from "../../models";
import { View } from "../../views";
import { BaseController } from "../base";
import { NodeChangeListener } from "../listener";
import { UIMessageRouter } from "../router";
import { FIGMA_KEY_IS_ROAD_CONTROL, FIGMA_KEY_NODE_ID, FIGMA_KEY_IS_NODE_MARKER, FIGMA_KEY_ROAD_ID, FIGMA_KEY_SECTION_ID, FIGMA_KEY_JUNCTION_OFFSET_X, FIGMA_KEY_JUNCTION_OFFSET_Y, NODE_DEFAULT_RADIUS } from "../../views/road";
import { RoadControlManager, FIGMA_KEY_BEZIER_HANDLE, FIGMA_KEY_OFFSET_HANDLE } from "./road-control";
import { NodeControlManager, FIGMA_KEY_IS_NODE_CONTROL, FIGMA_KEY_RADIUS_HANDLE } from "./node-control";
import { RoadPlacingState, SnapTarget } from "./road-placing";
import { AddingRsePluginSession } from "../../sessions/adding-rse";
import { AddingRoadPluginSession } from "../../sessions/adding-road";
import { own } from "@/common/utils/ownership";
import { absoluteOrigin } from "../../utils/math";


export class NetworkController extends BaseController {
  private readonly roadControl: RoadControlManager;
  private readonly nodeControl: NodeControlManager;
  private readonly roadPlacing = new RoadPlacingState();
  private isRendering = false;
  private isAddingRseMode = false;
  private pendingNodeMove: { nodeId: NodeId; startCenter: { x: number; y: number }; targetPos: { x: number; y: number }; keepNodeControl?: boolean } | null = null;

  constructor(model: Model, view: View, listener: NodeChangeListener, sessionManager: PluginSessionManager) {
    super(model, view, listener, sessionManager);
    this.roadControl = new RoadControlManager(model);
    this.nodeControl = new NodeControlManager(model);
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
        await this.render();
        this.reselectNode(nodeId);
        await this.save();
        break;
      case 'update-pass-ranks':
        if (node) node.updatePassRanks(patch.changes);
        if (node) await this.emitNodeLinesData(node);
        await this.render();
        this.reselectNode(nodeId);
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

  private applySectionRankChanges(
    section: ReturnType<Road['getSectionHarsh']>,
    changes: Array<{ lineId: LineId; passIndex: number; end: 'from' | 'to'; rank: number }>,
  ): void {
    for (const change of changes) {
      const line = this.model.state.getLine(change.lineId);
      const pass = line?.paths[change.passIndex];
      if (pass && pass.section === section) {
        if (change.end === 'from') pass.fromRank = change.rank;
        else pass.toRank = change.rank;
      }
    }
  }

  public async handlePatchRoad(roadId: RoadId, patch: RoadPatch): Promise<void> {
    const road = this.model.state.getRoad(roadId);
    switch (patch.op) {
      case 'apply': {
        if (!road) break;
        road.name = patch.name;
        const retained = new Set(patch.sections.filter(s => s.id !== null).map(s => s.id!));
        for (const section of [...road.getSections()]) {
          if (!retained.has(section.id)) this.model.removeRoadSection(section);
        }
        patch.sections.forEach((s, index) => {
          if (s.id !== null) {
            const section = road.getSectionHarsh(s.id);
            section.name = s.name;
            section.index = index;
          } else {
            this.model.addRoadSection(road, { name: s.name, index });
          }
        });
        await this.render();
        this.reselectRoad(roadId);
        break;
      }
      case 'update-section-ranks': {
        const section = road?.hasSection(patch.sectionId[1]) ? road.getSectionHarsh(patch.sectionId[1]) : undefined;
        if (section) this.applySectionRankChanges(section, patch.changes);
        await this.render();
        this.reselectRoad(roadId);
        if (road) await this.emitRoadLinesData(road);
        break;
      }
      case 'update-ranks-batch': {
        for (const { sectionId, changes } of patch.sections) {
          const section = road?.hasSection(sectionId[1]) ? road.getSectionHarsh(sectionId[1]) : undefined;
          if (section) this.applySectionRankChanges(section, changes);
        }
        await this.render();
        this.reselectRoad(roadId);
        if (road) await this.emitRoadLinesData(road);
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
      enabled => this.roadPlacing.setSnapEnabled(enabled),
    ));
  }

  // Resolves a road-placing endpoint's snap target to an actual Node, splicing a new
  // junction into an existing road if the endpoint snapped to a mid-road point. Falls
  // back to a plain new node if a mid-road target's road was already consumed by the
  // other endpoint's split (both endpoints snapped into the same road).
  private resolveEndpointNode(snap: SnapTarget | null, pos: Vector): Node {
    if (!snap) return this.model.addNode({ position: pos, radius: NODE_DEFAULT_RADIUS });
    if (snap.kind === 'node') return snap.node;
    if (!this.model.state.getRoad(snap.road.id)) return this.model.addNode({ position: pos, radius: NODE_DEFAULT_RADIUS });
    return this.model.splitRoad(snap.road, snap.t, NODE_DEFAULT_RADIUS);
  }

  private async confirmRoadPlacing(): Promise<void> {
    const result = this.roadPlacing.getResult();
    await this.roadPlacing.cleanup();

    if (result) {
      const startNode = this.resolveEndpointNode(result.startSnap, result.startPos);
      const endNode   = this.resolveEndpointNode(result.endSnap,   result.endPos);

      this.model.addRoad({
        name: undefined,
        bezierMidPoint: result.bezierPos,
        endpoints: [
          own({ node: startNode, horizontalOffset: 0, groupNumber: 0 }),
          own({ node: endNode,   horizontalOffset: 0, groupNumber: 0 }),
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
    // A full render() removes and recreates the junction/marker/road-path nodes,
    // which drops whatever was selected on canvas and fires a spurious
    // selectionchange with an empty selection. Ignore selection changes while our
    // own render is in flight so that doesn't get misread as the user deselecting.
    if (this.view.isRendering) return;

    await this.flushPendingNodeMove();
    await this.flushControlDirty();

    const selection = figma.currentPage.selection;
    const first = selection[0];

    if (selection.length === 0) {
      await this.clearNetworkFocus();
      return;
    }

    if (this.isAddingRseMode) {
      const roadId = first.getPluginData(FIGMA_KEY_ROAD_ID) as RoadId;
      const sectionIdPart = first.getPluginData(FIGMA_KEY_SECTION_ID) as SectionId;
      const sectionId: RoadSectionId | null = sectionIdPart ? [roadId, sectionIdPart] : null;
      if (roadId) postMessageToUI({ type: 'road-clicked', roadId, sectionId });
      return;
    }

    if (first.getPluginData(FIGMA_KEY_IS_ROAD_CONTROL) === 'true') {
      const roadId = first.getPluginData(FIGMA_KEY_ROAD_ID) as RoadId;
      if (roadId) postMessageToUI({ type: 'network-element-focused', element: this.buildRoadElement(roadId) });
      return;
    }

    if (first.getPluginData(FIGMA_KEY_IS_NODE_CONTROL) === 'true') {
      const nodeId = this.nodeControl.activeNodeId;
      if (nodeId) postMessageToUI({ type: 'network-element-focused', element: this.buildNodeElement(nodeId) });
      return;
    }

    const nodeId = first.getPluginData(FIGMA_KEY_NODE_ID) as NodeId;
    if (nodeId) {
      await this.roadControl.remove();
      await this.nodeControl.activate(nodeId);
      postMessageToUI({ type: 'network-element-focused', element: this.buildNodeElement(nodeId) });
      const node = this.model.state.getNode(nodeId);
      if (node) await this.emitNodeLinesData(node);
      return;
    }

    const roadId = first.getPluginData(FIGMA_KEY_ROAD_ID) as RoadId;
    if (roadId) {
      await this.nodeControl.remove();
      await this.roadControl.activate(roadId);
      postMessageToUI({ type: 'network-element-focused', element: this.buildRoadElement(roadId) });
      const road = this.model.state.getRoad(roadId);
      if (road) await this.emitRoadLinesData(road);
      return;
    }

    await this.clearNetworkFocus();
  }

  public async handleDocumentChange(event: DocumentChangeEvent): Promise<void> {
    if (this.isRendering || this.view.isRendering) return;
    const suppressThisBatch = this.roadControl.suppressNextControlChanges || this.nodeControl.suppressNextControlChanges;
    this.roadControl.suppressNextControlChanges = false;
    this.nodeControl.suppressNextControlChanges = false;

    for (const change of event.documentChanges) {
      if (change.type !== 'PROPERTY_CHANGE') continue;
      const isResize = change.properties.includes('width') || change.properties.includes('height');
      if (!change.properties.includes('x') && !change.properties.includes('y') && !isResize) continue;
      if (suppressThisBatch && (this.roadControl.isControlElement(change.id) || this.nodeControl.isControlElement(change.id))) continue;

      const figmaNode = await figma.getNodeByIdAsync(change.id);
      if (!figmaNode || figmaNode.removed) continue;

      const nodeId = figmaNode.getPluginData(FIGMA_KEY_NODE_ID) as NodeId;
      if (nodeId) {
        if (figmaNode.getPluginData(FIGMA_KEY_IS_NODE_MARKER) === 'true') {
          const frame = figmaNode as FrameNode;
          const origin = absoluteOrigin(frame);
          await this.onNodePositionChanged(nodeId, { x: origin.x + frame.width / 2, y: origin.y + frame.height / 2 });
          return;
        }
        if (figmaNode.type === 'FRAME') {
          const frame = figmaNode as FrameNode;
          const ox = Number.parseFloat(frame.getPluginData(FIGMA_KEY_JUNCTION_OFFSET_X) || '0');
          const oy = Number.parseFloat(frame.getPluginData(FIGMA_KEY_JUNCTION_OFFSET_Y) || '0');
          const origin = absoluteOrigin(frame);
          await this.onNodePositionChanged(nodeId, { x: origin.x + ox, y: origin.y + oy });
          return;
        }
      }

      if (figmaNode.getPluginData(FIGMA_KEY_RADIUS_HANDLE) === 'radius') {
        const controlledNodeId = this.nodeControl.activeNodeId;
        if (controlledNodeId) {
          const handle = figmaNode as EllipseNode;
          if (isResize) {
            await this.nodeControl.onRadiusHandleResized(controlledNodeId, handle);
          } else {
            // Plain drag (no size change): move the node itself, same as dragging its marker/junction.
            // Keep the handle alive since it's the very element being dragged.
            const origin = absoluteOrigin(handle);
            await this.onNodePositionChanged(controlledNodeId, { x: origin.x + handle.width / 2, y: origin.y + handle.height / 2 }, { keepNodeControl: true });
          }
          return;
        }
      }

      const offsetSide = figmaNode.getPluginData(FIGMA_KEY_OFFSET_HANDLE) as 'start' | 'end' | '';
      if (offsetSide) {
        const offsetRoadId = figmaNode.getPluginData(FIGMA_KEY_ROAD_ID) as RoadId;
        if (offsetRoadId) {
          await this.roadControl.onOffsetHandleMoved(offsetRoadId, offsetSide, figmaNode as FrameNode);
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
    this.pendingNodeMove = null;
    this.roadControl.cleanup();
    this.nodeControl.cleanup();
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

  // Buffers drag updates instead of committing them to the model live: each
  // intermediate PROPERTY_CHANGE during a drag just updates the pending target
  // position, and the actual node.moveByDelta (plus render/save) only happens
  // once the selection moves away from the node — the canvas equivalent of
  // committing on blur rather than on every keystroke.
  private async onNodePositionChanged(nodeId: NodeId, newPos: { x: number; y: number }, options?: { keepNodeControl?: boolean }): Promise<void> {
    const node = this.model.state.getNode(nodeId);
    if (!node) return;

    if (!this.pendingNodeMove || this.pendingNodeMove.nodeId !== nodeId) {
      this.pendingNodeMove = { nodeId, startCenter: node.getCenter(), targetPos: newPos, keepNodeControl: options?.keepNodeControl };
    } else {
      this.pendingNodeMove.targetPos = newPos;
      if (options?.keepNodeControl) this.pendingNodeMove.keepNodeControl = true;
    }
  }

  private async flushPendingNodeMove(): Promise<void> {
    const pending = this.pendingNodeMove;
    this.pendingNodeMove = null;
    if (!pending) return;

    const node = this.model.state.getNode(pending.nodeId);
    if (!node) return;

    const delta = { x: pending.targetPos.x - pending.startCenter.x, y: pending.targetPos.y - pending.startCenter.y };
    if (Math.abs(delta.x) < 0.5 && Math.abs(delta.y) < 0.5) return;

    node.moveByDelta(delta);
    await this.roadControl.remove();
    if (!pending.keepNodeControl) await this.nodeControl.remove();

    this.isRendering = true;
    try { await this.render(); await this.save(); } finally { this.isRendering = false; }
    this.syncNetworkToUI();
    postMessageToUI({ type: 'network-element-focused', element: this.buildNodeElement(pending.nodeId) });
  }

  // The mid-bezier, offset, and radius handles only keep their own overlay live during
  // a drag (see updateRoadAndStems) — the base road/junction visuals are stale until a
  // real render() catches them up. Called before any focus switch (including losing
  // focus entirely) so that render only happens when a handle actually moved something,
  // never on a plain focus/unfocus with no drag.
  private async flushControlDirty(): Promise<void> {
    if (!this.roadControl.isDirty && !this.nodeControl.isDirty) return;
    this.isRendering = true;
    try { await this.render(); await this.save(); } finally { this.isRendering = false; }
  }

  private async clearNetworkFocus(): Promise<void> {
    await this.flushControlDirty();
    await this.roadControl.remove();
    await this.nodeControl.remove();
    postMessageToUI({ type: 'network-selection-cleared' });
  }

  // Re-selects the freshly-rendered figma node for a road/node after a render()
  // that just destroyed and recreated it, so the canvas selection (and thus the
  // road/node control overlay, via the normal selectionchange flow) comes back
  // instead of staying empty.
  private reselectRoad(roadId: RoadId): void {
    const target = figma.currentPage.children.find(c =>
      c.getPluginData(FIGMA_KEY_ROAD_ID) === roadId && c.getPluginData(FIGMA_KEY_IS_ROAD_CONTROL) !== 'true'
    );
    if (target) figma.currentPage.selection = [target as SceneNode];
  }

  private reselectNode(nodeId: NodeId): void {
    const target = figma.currentPage.children.find(c => c.getPluginData(FIGMA_KEY_NODE_ID) === nodeId);
    if (target) figma.currentPage.selection = [target as SceneNode];
  }

  private buildNodeElement(nodeId: NodeId): NetworkFocusedElement {
    const node = this.model.state.getNode(nodeId);
    return {
      kind: 'node', nodeId, name: node?.name,
      pos: node?.getCenter() ?? { x: 0, y: 0 }
    };
  }

  public async emitNodeLinesData(node: Node): Promise<void> {
    const entries = node.getPassBoundaryEntries();

    type ArmEntry = { pass: RoadSectionPass; end: 'from' | 'to'; rank: number; lineId: string; passIndex: number };
    const sectionGroups = new Map<string, ArmEntry[]>();
    for (const { line, pass, passIndex, end } of entries) {
      const key = pass.section.id;
      const g = sectionGroups.get(key) ?? [];
      g.push({ pass, end, rank: end === 'from' ? pass.fromRank : pass.toRank, lineId: line.id, passIndex });
      sectionGroups.set(key, g);
    }

    let changed = false;
    for (const group of sectionGroups.values()) {
      group.sort((a, b) => {
        if (a.rank !== b.rank) return a.rank - b.rank;
        if (a.lineId !== b.lineId) return a.lineId < b.lineId ? -1 : 1;
        return a.passIndex - b.passIndex;
      });
      group.forEach((item, i) => {
        if (item.end === 'from' && item.pass.fromRank !== i) { item.pass.fromRank = i; changed = true; }
        if (item.end === 'to' && item.pass.toRank !== i) { item.pass.toRank = i; changed = true; }
      });
    }

    if (changed) await this.save();

    // Pair each pass-boundary (a pass ending here / the next pass starting here) into
    // one row per crossing — either side may be absent at the true start/end of a
    // line's path, or when an invalid-jump gap happens to land on this node from only
    // one side.
    const lines: LineAtNodeData[] = [];
    for (const line of this.model.state.getLines()) {
      for (let i = 0; i <= line.paths.length; i++) {
        const fromPass = i > 0 ? line.paths[i - 1] : null;
        const toPass = i < line.paths.length ? line.paths[i] : null;
        const fromTouches = fromPass?.toNode === node;
        const toTouches = toPass?.fromNode === node;
        if (!fromTouches && !toTouches) continue;
        lines.push({
          lineId: line.id, lineName: line.name, lineColor: line.color,
          exitingPassIndex: fromTouches ? i - 1 : null,
          enteringPassIndex: toTouches ? i : null,
          exitingSectionId: fromTouches ? fromPass!.section.getRoadSectionId() : null,
          enteringSectionId: toTouches ? toPass!.section.getRoadSectionId() : null,
          exitRank: fromTouches ? fromPass!.toRank : 0,
          enterRank: toTouches ? toPass!.fromRank : 0,
        });
      }
    }
    postMessageToUI({ type: 'node-lines-data', nodeId: node.id, lines });
  }

  // The road-panel analog of emitNodeLinesData: for every section on the road, group
  // each line's pass by which physical side (0/1) of that section it touches, and
  // renumber the stacking rank within each (section, side) group.
  public async emitRoadLinesData(road: Road): Promise<void> {
    type SideEntry = { line: Line; pass: RoadSectionPass; end: 'from' | 'to'; rank: number; passIndex: number; sectionId: RoadSectionId; side: 0 | 1 };
    const sideGroups = new Map<string, SideEntry[]>();
    for (const section of road.getSections()) {
      const sectionId = section.getRoadSectionId();
      for (const line of this.model.state.getLines()) {
        for (const [passIndex, pass] of line.paths.entries()) {
          if (pass.section !== section) continue;
          const fromSide: 0 | 1 = pass.direction === 'ascending' ? 0 : 1;
          const toSide: 0 | 1 = fromSide === 0 ? 1 : 0;
          for (const [end, side] of [['from', fromSide], ['to', toSide]] as const) {
            const key = `${sectionId.join(':')}:${side}`;
            const g = sideGroups.get(key) ?? [];
            g.push({ line, pass, end, rank: end === 'from' ? pass.fromRank : pass.toRank, passIndex, sectionId, side });
            sideGroups.set(key, g);
          }
        }
      }
    }

    let changed = false;
    const lines: LineAtRoadSectionData[] = [];
    for (const group of sideGroups.values()) {
      group.sort((a, b) => {
        if (a.rank !== b.rank) return a.rank - b.rank;
        if (a.line.id !== b.line.id) return a.line.id < b.line.id ? -1 : 1;
        return a.passIndex - b.passIndex;
      });
      group.forEach((item, i) => {
        if (item.end === 'from' && item.pass.fromRank !== i) { item.pass.fromRank = i; changed = true; }
        if (item.end === 'to' && item.pass.toRank !== i) { item.pass.toRank = i; changed = true; }
        lines.push({
          lineId: item.line.id, lineName: item.line.name, lineColor: item.line.color,
          sectionId: item.sectionId, side: item.side, end: item.end, passIndex: item.passIndex, rank: i,
        });
      });
    }

    if (changed) await this.save();
    postMessageToUI({ type: 'road-lines-data', roadId: road.id, lines });
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
