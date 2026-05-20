import { NodeId, RoadId } from "@/common/types";
import { NetworkFocusedElement, NodeData, RoadData, RoadSectionData } from "@/common/messages";
import { postMessageToUI } from "../figma";
import { Model } from "../models";
import { BaseController } from "./base";
import { FIGMA_KEY_IS_ROAD_CONTROL, FIGMA_KEY_NODE_ID, FIGMA_KEY_ROAD_ID, NODE_RADIUS } from "../views/road";

const ROAD_CONTROL_NODE_NAME = '_road-bezier-control';
const FIGMA_KEY_BEZIER_HANDLE   = 'mapBezierHandle';   // value: 'start' | 'end'
const FIGMA_KEY_ENDPOINT_HANDLE = 'mapEndpointHandle'; // value: 'start' | 'end'
const HANDLE_RADIUS = 5;
const BEZIER_HANDLE_FILL:   RGB = { r: 0.1,  g: 0.47, b: 1    };
const BEZIER_HANDLE_STROKE: RGB = { r: 1,    g: 1,    b: 1    };
const ENDPOINT_HANDLE_FILL:   RGB = { r: 0.15, g: 0.15, b: 0.15 };
const ENDPOINT_HANDLE_STROKE: RGB = { r: 1,    g: 1,    b: 1    };
const STEM_STROKE: RGB = { r: 0.6, g: 0.75, b: 1 };

// ─── Network sync helper ───────────────────────────────────────────────────

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

// ─── Controller ────────────────────────────────────────────────────────────

export class NetworkController extends BaseController {
  private roadControlRoadId: RoadId | null = null;
  private roadControlElementIds: string[] = [];
  private isRendering = false;
  private suppressNextControlChanges = false; // true for the one documentchange batch after activateRoadControl
  private renderDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private roadCreationMode: 'idle' | 'first-node' | 'second-node' = 'idle';
  private roadCreationStartNodeId: NodeId | null = null;

  // ── Figma event entry points ────────────────────────────────────────────

  public async handleSelectionChange(): Promise<void> {
    const selection = figma.currentPage.selection;
    const first = selection[0];

    // Road creation mode: capture node clicks; anything else cancels
    if (this.roadCreationMode !== 'idle') {
      if (first) {
        const nodeId = first.getPluginData(FIGMA_KEY_NODE_ID) as NodeId | '';
        if (nodeId) {
          await this.handleRoadCreationNodeClick(nodeId);
          return;
        }
      }
      this.exitRoadCreationMode();
      return;
    }

    if (selection.length === 0) {
      await this.clearNetworkFocus();
      return;
    }

    // Any road control element (reference line or handle) → just reflect in UI, no re-activation
    if (first.getPluginData(FIGMA_KEY_IS_ROAD_CONTROL) === 'true') {
      const roadId = first.getPluginData(FIGMA_KEY_ROAD_ID) as RoadId;
      if (roadId) postMessageToUI({ type: 'network-element-focused', element: this.buildRoadElement(roadId) });
      return;
    }

    const nodeId = first.getPluginData(FIGMA_KEY_NODE_ID) as NodeId | '';
    if (nodeId) {
      await this.removeRoadControl();
      postMessageToUI({ type: 'network-element-focused', element: this.buildNodeElement(nodeId) });
      return;
    }

    const roadId = first.getPluginData(FIGMA_KEY_ROAD_ID) as RoadId | '';
    if (roadId) {
      await this.activateRoadControl(roadId);
      return;
    }

    await this.clearNetworkFocus();
  }

  public async handleDocumentChange(event: DocumentChangeEvent): Promise<void> {
    if (this.isRendering) return;
    // Consume the flag for this entire batch. If we just activated road controls, this
    // batch contains our own position-assignment events; later batches are real user drags.
    const suppressThisBatch = this.suppressNextControlChanges;
    this.suppressNextControlChanges = false;

    for (const change of event.documentChanges) {
      if (change.type !== 'PROPERTY_CHANGE') continue;
      if (!change.properties.includes('x') && !change.properties.includes('y')) continue;
      if (suppressThisBatch && this.roadControlElementIds.includes(change.id)) continue;

      const figmaNode = await figma.getNodeByIdAsync(change.id);
      if (!figmaNode || figmaNode.removed) continue;

      // Junction node dragged
      const nodeId = figmaNode.getPluginData(FIGMA_KEY_NODE_ID) as NodeId | '';
      if (nodeId) {
        await this.onNodeMarkerMoved(nodeId, figmaNode as EllipseNode);
        return;
      }

      // Road endpoint handle dragged (while in road edit mode) — moves p0/p3 independent of the node
      const endpointSide = figmaNode.getPluginData(FIGMA_KEY_ENDPOINT_HANDLE) as 'start' | 'end' | '';
      if (endpointSide) {
        const endpointRoadId = figmaNode.getPluginData(FIGMA_KEY_ROAD_ID) as RoadId | '';
        if (endpointRoadId) {
          await this.onEndpointHandleMoved(endpointRoadId, endpointSide, figmaNode as EllipseNode);
          return;
        }
      }

      // Bezier handle dragged
      const handleSide = figmaNode.getPluginData(FIGMA_KEY_BEZIER_HANDLE) as 'start' | 'end' | '';
      if (!handleSide) {
        continue;
      }

      const roadId = figmaNode.getPluginData(FIGMA_KEY_ROAD_ID) as RoadId | '';
      if (roadId) {
        await this.onBezierHandleMoved(roadId, handleSide, figmaNode as EllipseNode);
        return;
      }
    }
  }

  // ── Node interaction ────────────────────────────────────────────────────

  private async onNodeMarkerMoved(nodeId: NodeId, ellipse: EllipseNode): Promise<void> {
    const newPos = { x: ellipse.x + NODE_RADIUS, y: ellipse.y + NODE_RADIUS };
    this.model.updateNodePosition(nodeId, newPos);
    await this.removeRoadControl();

    // Debounce: clearPrevious() inside render() destroys the ellipse being dragged,
    // cancelling the drag. Wait until the drag settles before re-rendering.
    if (this.renderDebounceTimer !== null) clearTimeout(this.renderDebounceTimer);
    this.renderDebounceTimer = setTimeout(async () => {
      this.renderDebounceTimer = null;
      this.isRendering = true;
      try {
        await this.render();
        await this.save();
      } finally {
        this.isRendering = false;
      }
      postMessageToUI({ type: 'network-data', ...buildNetworkPayload(this.model) });
      postMessageToUI({ type: 'network-element-focused', element: this.buildNodeElement(nodeId) });
    }, 500);
  }

  // ── Road endpoint handle interaction (p0 / p3) ──────────────────────────

  private async onEndpointHandleMoved(roadId: RoadId, side: 'start' | 'end', handle: EllipseNode): Promise<void> {
    const handlePos = { x: handle.x + HANDLE_RADIUS, y: handle.y + HANDLE_RADIUS };
    const state = this.model.getState();
    const road = state.roads.get(roadId);
    if (!road) return;

    if (side === 'start') {
      const startNode = state.nodes.get(road.startNodeId);
      if (!startNode) return;
      this.model.updateRoadEndpoints(roadId, [
        { ...road.endpoints[0], endpointDisplacement: { x: handlePos.x - startNode.pos.x, y: handlePos.y - startNode.pos.y } },
        road.endpoints[1],
      ]);
    } else {
      const endNode = state.nodes.get(road.endNodeId);
      if (!endNode) return;
      this.model.updateRoadEndpoints(roadId, [
        road.endpoints[0],
        { ...road.endpoints[1], endpointDisplacement: { x: handlePos.x - endNode.pos.x, y: handlePos.y - endNode.pos.y } },
      ]);
    }
    // No render here — visuals update when the road loses focus.
  }

  // ── Bezier handle interaction (p1 / p2) ─────────────────────────────────

  private async onBezierHandleMoved(roadId: RoadId, side: 'start' | 'end', handle: EllipseNode): Promise<void> {
    const handlePos = { x: handle.x + HANDLE_RADIUS, y: handle.y + HANDLE_RADIUS };
    const state = this.model.getState();
    const road = state.roads.get(roadId);
    if (!road) return;

    if (side === 'start') {
      const startNode = state.nodes.get(road.startNodeId);
      if (!startNode) return;
      const p0 = { x: startNode.pos.x + road.endpoints[0].endpointDisplacement.x, y: startNode.pos.y + road.endpoints[0].endpointDisplacement.y };
      this.model.updateRoadEndpoints(roadId, [
        { ...road.endpoints[0], bezierDisplacement: { x: handlePos.x - p0.x, y: handlePos.y - p0.y } },
        road.endpoints[1],
      ]);
    } else {
      const endNode = state.nodes.get(road.endNodeId);
      if (!endNode) return;
      const p3 = { x: endNode.pos.x + road.endpoints[1].endpointDisplacement.x, y: endNode.pos.y + road.endpoints[1].endpointDisplacement.y };
      this.model.updateRoadEndpoints(roadId, [
        road.endpoints[0],
        { ...road.endpoints[1], bezierDisplacement: { x: handlePos.x - p3.x, y: handlePos.y - p3.y } },
      ]);
    }
    // No render here — visuals update when the road loses focus (see clearNetworkFocus).
  }

  // ── Road creation mode ─────────────────────────────────────────────────

  public async startRoadCreationMode(): Promise<void> {
    this.roadCreationMode = 'first-node';
    this.roadCreationStartNodeId = null;
  }

  public async cancelRoadCreationMode(): Promise<void> {
    if (this.roadCreationMode !== 'idle') this.exitRoadCreationMode();
  }

  private async handleRoadCreationNodeClick(nodeId: NodeId): Promise<void> {
    if (this.roadCreationMode === 'first-node') {
      this.roadCreationStartNodeId = nodeId;
      this.roadCreationMode = 'second-node';
      const node = this.model.getState().nodes.get(nodeId);
      postMessageToUI({ type: 'road-creation-first-node', nodeId, name: node?.name });
    } else if (this.roadCreationMode === 'second-node' && this.roadCreationStartNodeId) {
      if (nodeId !== this.roadCreationStartNodeId) {
        await this.finishRoadCreation(this.roadCreationStartNodeId, nodeId);
      }
      // If same node clicked again, just wait for a different one
    }
  }

  private async finishRoadCreation(startNodeId: NodeId, endNodeId: NodeId): Promise<void> {
    const state = this.model.getState();
    const start = state.nodes.get(startNodeId);
    const end   = state.nodes.get(endNodeId);
    if (start && end) {
      const dx = end.pos.x - start.pos.x;
      const dy = end.pos.y - start.pos.y;
      this.model.addRoad({
        name: undefined,
        startNodeId,
        endNodeId,
        endpoints: [
          { endpointDisplacement: { x: 0, y: 0 }, bezierDisplacement: { x: dx / 3, y: dy / 3 }, bezierDirection: { x: dx, y: dy }, groupNumber: 0 },
          { endpointDisplacement: { x: 0, y: 0 }, bezierDisplacement: { x: -dx / 3, y: -dy / 3 }, bezierDirection: { x: -dx, y: -dy }, groupNumber: 0 },
        ],
        sections: new Map(),
      });
      this.isRendering = true;
      try {
        await this.render();
        await this.save();
      } finally {
        this.isRendering = false;
      }
      postMessageToUI({ type: 'network-data', ...buildNetworkPayload(this.model) });
    }
    this.exitRoadCreationMode();
  }

  private exitRoadCreationMode(): void {
    this.roadCreationMode = 'idle';
    this.roadCreationStartNodeId = null;
    postMessageToUI({ type: 'road-creation-exited' });
  }

  // ── Road control elements ───────────────────────────────────────────────


  private async activateRoadControl(roadId: RoadId): Promise<void> {
    await this.removeRoadControl();

    const state = this.model.getState();
    const road = state.roads.get(roadId);
    if (!road) return;

    const startNode = state.nodes.get(road.startNodeId);
    const endNode   = state.nodes.get(road.endNodeId);
    if (!startNode || !endNode) return;

    const p0 = { x: startNode.pos.x + road.endpoints[0].endpointDisplacement.x, y: startNode.pos.y + road.endpoints[0].endpointDisplacement.y };
    const p1 = { x: p0.x + road.endpoints[0].bezierDisplacement.x, y: p0.y + road.endpoints[0].bezierDisplacement.y };
    const p3 = { x: endNode.pos.x + road.endpoints[1].endpointDisplacement.x, y: endNode.pos.y + road.endpoints[1].endpointDisplacement.y };
    const p2 = { x: p3.x + road.endpoints[1].bezierDisplacement.x, y: p3.y + road.endpoints[1].bezierDisplacement.y };

    // Dashed bezier reference line (visual only — not interactive)
    const vector = figma.createVector();
    vector.name = ROAD_CONTROL_NODE_NAME;
    vector.vectorPaths = [{ windingRule: 'NONZERO', data: `M ${p0.x} ${p0.y} C ${p1.x} ${p1.y} ${p2.x} ${p2.y} ${p3.x} ${p3.y}` }];
    vector.fills = [];
    vector.strokes = [{ type: 'SOLID', color: { r: 0.1, g: 0.47, b: 1 } }];
    vector.strokeWeight = 2;
    vector.strokeCap = 'ROUND';
    vector.dashPattern = [6, 4];
    vector.setPluginData(FIGMA_KEY_ROAD_ID, roadId);
    vector.setPluginData(FIGMA_KEY_IS_ROAD_CONTROL, 'true');
    figma.currentPage.appendChild(vector);

    // Stems: node → endpoint (shows offset), endpoint → bezier control point
    const startNodeStem = this.buildStemLine(startNode.pos, p0, roadId);
    const startStem     = this.buildStemLine(p0, p1, roadId);
    const endNodeStem   = this.buildStemLine(endNode.pos, p3, roadId);
    const endStem       = this.buildStemLine(p3, p2, roadId);
    figma.currentPage.appendChild(startNodeStem);
    figma.currentPage.appendChild(startStem);
    figma.currentPage.appendChild(endNodeStem);
    figma.currentPage.appendChild(endStem);

    // Draggable endpoint handles (dark) at p0 / p3 — move the road start/end independently of the node
    const startEndpointHandle = this.buildEndpointHandle(p0, roadId, 'start');
    const endEndpointHandle   = this.buildEndpointHandle(p3, roadId, 'end');
    figma.currentPage.appendChild(startEndpointHandle);
    figma.currentPage.appendChild(endEndpointHandle);

    // Draggable bezier control handles (blue) at p1 / p2
    const startHandle = this.buildBezierHandle(p1, roadId, 'start');
    const endHandle   = this.buildBezierHandle(p2, roadId, 'end');
    figma.currentPage.appendChild(startHandle);
    figma.currentPage.appendChild(endHandle);

    this.roadControlRoadId     = roadId;
    this.roadControlElementIds = [
      vector.id,
      startNodeStem.id, startStem.id, endNodeStem.id, endStem.id,
      startEndpointHandle.id, endEndpointHandle.id,
      startHandle.id, endHandle.id,
    ];
    // The next documentchange batch will contain our own position-assignment events; suppress them.
    this.suppressNextControlChanges = true;

    postMessageToUI({ type: 'network-element-focused', element: this.buildRoadElement(roadId) });
  }

  private buildEndpointHandle(pos: Vector, roadId: RoadId, side: 'start' | 'end'): EllipseNode {
    const ellipse = figma.createEllipse();
    ellipse.resize(HANDLE_RADIUS * 2, HANDLE_RADIUS * 2);
    ellipse.x = pos.x - HANDLE_RADIUS;
    ellipse.y = pos.y - HANDLE_RADIUS;
    ellipse.fills   = [{ type: 'SOLID', color: ENDPOINT_HANDLE_FILL }];
    ellipse.strokes = [{ type: 'SOLID', color: ENDPOINT_HANDLE_STROKE }];
    ellipse.strokeWeight = 1.5;
    ellipse.name = `Endpoint: ${side}`;
    ellipse.setPluginData(FIGMA_KEY_ROAD_ID, roadId);
    ellipse.setPluginData(FIGMA_KEY_IS_ROAD_CONTROL, 'true');
    ellipse.setPluginData(FIGMA_KEY_ENDPOINT_HANDLE, side);
    return ellipse;
  }

  private buildBezierHandle(pos: Vector, roadId: RoadId, side: 'start' | 'end'): EllipseNode {
    const ellipse = figma.createEllipse();
    ellipse.resize(HANDLE_RADIUS * 2, HANDLE_RADIUS * 2);
    ellipse.x = pos.x - HANDLE_RADIUS;
    ellipse.y = pos.y - HANDLE_RADIUS;
    ellipse.fills   = [{ type: 'SOLID', color: BEZIER_HANDLE_FILL }];
    ellipse.strokes = [{ type: 'SOLID', color: BEZIER_HANDLE_STROKE }];
    ellipse.strokeWeight = 1.5;
    ellipse.name = `Bezier: ${side}`;
    ellipse.setPluginData(FIGMA_KEY_ROAD_ID, roadId);
    ellipse.setPluginData(FIGMA_KEY_IS_ROAD_CONTROL, 'true');
    ellipse.setPluginData(FIGMA_KEY_BEZIER_HANDLE, side);
    return ellipse;
  }

  private buildStemLine(from: Vector, to: Vector, roadId: RoadId): VectorNode {
    const v = figma.createVector();
    v.name = `${ROAD_CONTROL_NODE_NAME}-stem`;
    v.vectorPaths = [{ windingRule: 'NONZERO', data: `M ${from.x} ${from.y} L ${to.x} ${to.y}` }];
    v.fills = [];
    v.strokes = [{ type: 'SOLID', color: STEM_STROKE }];
    v.strokeWeight = 1;
    v.setPluginData(FIGMA_KEY_ROAD_ID, roadId);
    v.setPluginData(FIGMA_KEY_IS_ROAD_CONTROL, 'true');
    return v;
  }

  private async removeRoadControl(): Promise<void> {
    for (const id of this.roadControlElementIds) {
      const node = await figma.getNodeByIdAsync(id);
      if (node && !node.removed) node.remove();
    }
    this.roadControlElementIds = [];
    this.roadControlRoadId     = null;
  }

  public cleanup(): void {
    if (this.renderDebounceTimer !== null) {
      clearTimeout(this.renderDebounceTimer);
      this.renderDebounceTimer = null;
    }
    // findAll is synchronous — safe to call from the plugin close handler.
    figma.currentPage
      .findAll(n => n.getPluginData(FIGMA_KEY_IS_ROAD_CONTROL) === 'true')
      .forEach(n => { if (!n.removed) n.remove(); });
    this.roadControlElementIds = [];
    this.roadControlRoadId     = null;
  }

  private async clearNetworkFocus(): Promise<void> {
    if (this.renderDebounceTimer !== null) {
      clearTimeout(this.renderDebounceTimer);
      this.renderDebounceTimer = null;
    }
    const wasEditingRoad = this.roadControlRoadId !== null;
    await this.removeRoadControl();
    if (wasEditingRoad) {
      this.isRendering = true;
      try {
        await this.render();
        await this.save();
      } finally {
        this.isRendering = false;
      }
    }
    postMessageToUI({ type: 'network-selection-cleared' });
  }

  // ── Element builders ────────────────────────────────────────────────────

  private buildNodeElement(nodeId: NodeId): NetworkFocusedElement {
    const node = this.model.getState().nodes.get(nodeId);
    return { kind: 'node', nodeId, name: node?.name, pos: node?.pos ?? { x: 0, y: 0 } };
  }

  private buildRoadElement(roadId: RoadId): NetworkFocusedElement {
    const road = this.model.getState().roads.get(roadId);
    if (!road) return { kind: 'road', roadId, startNodeId: '' as any, endNodeId: '' as any, sections: [] };
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
