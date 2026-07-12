import { NodeId, RoadId } from "@/common/types";
import { MapState, Node, Road } from "../../models/structures";
import { renderRoad } from "./road-visuals";
import { buildAndAppendJunction, buildNodeMarker } from "./node-visuals";
import { FIGMA_KEY_NODE_ID, FIGMA_KEY_IS_NODE_MARKER, FIGMA_KEY_ROAD_ID, FIGMA_KEY_IS_ROAD_CONTROL } from "./constants";

// Legacy group name kept so old renders from previous sessions can be cleaned up.
const ROAD_NETWORK_GROUP_NAME = '_road-network';

// Re-appending a child moves it to the very top of the page's z-order, above
// everything else (including non-plugin content). Calling this in bottom-to-top
// order for each layer therefore both fixes the relative order *and* guarantees
// all plugin layers end up above any non-plugin objects on the page.
function bringToFront(children: readonly SceneNode[], predicate: (c: SceneNode) => boolean): void {
  for (const child of children) {
    if (!child.removed && predicate(child)) figma.currentPage.appendChild(child);
  }
}

export class RoadRenderer {
  public static async renderAll(state: Readonly<MapState>): Promise<void> {
    await RoadRenderer.clearPrevious();
    for (const road of state.getRoads()) renderRoad(road);
    const nodesWithJunction = await RoadRenderer.renderJunctions(state);
    await RoadRenderer.renderNodeMarkers(state, nodesWithJunction);
  }

  // Rebuilds only the given roads and the junctions/markers at the given nodes, leaving
  // every other road/junction/marker on the page untouched. Callers are expected to pass
  // the roads directly affected by an edit plus every node those roads touch — a junction
  // is purely a function of the roads meeting at its own node (see JunctionShape), so that
  // set is always enough to keep every visual consistent with the model.
  // `removedRoadIds`/`removedNodeIds` are ids that no longer exist in the model at all
  // (deleted outright, or replaced by a split) — their stale figma nodes are cleared but
  // never rebuilt, unlike `roads`/`nodes` which are cleared *and* rebuilt.
  public static async renderPartial({
    roads = [], nodes = [], removedRoadIds = [], removedNodeIds = [],
  }: { roads?: Road[]; nodes?: Node[]; removedRoadIds?: readonly RoadId[]; removedNodeIds?: readonly NodeId[] }): Promise<void> {
    // Cleared ids are compared against figma's untyped getPluginData() strings, so the
    // set itself is plain string — the RoadId/NodeId branding only needs to hold at the
    // call site, where these ids are handed off from real Road/Node objects.
    const roadIds = new Set<string>(roads.map(r => r.id as string));
    for (const id of removedRoadIds) roadIds.add(id);
    const nodeIds = new Set<string>(nodes.map(n => n.id as string));
    for (const id of removedNodeIds) nodeIds.add(id);
    RoadRenderer.clearRoads(roadIds);
    RoadRenderer.clearNodes(nodeIds);

    for (const road of roads) renderRoad(road);

    const nodesWithJunction = new Set<string>();
    for (const node of nodes) {
      if (await buildAndAppendJunction(node)) nodesWithJunction.add(node.id);
    }
    for (const node of nodes) {
      if (nodesWithJunction.has(node.id)) continue;
      const marker = await buildNodeMarker(node);
      if (marker) figma.currentPage.appendChild(marker);
    }
  }

  private static async renderJunctions(state: Readonly<MapState>): Promise<Set<string>> {
    const nodesWithJunction = new Set<string>();
    for (const node of state.getNodes()) {
      if (await buildAndAppendJunction(node)) nodesWithJunction.add(node.id);
    }
    return nodesWithJunction;
  }

  private static async renderNodeMarkers(state: Readonly<MapState>, nodesWithJunction: Set<string>): Promise<void> {
    for (const node of state.getNodes()) {
      if (nodesWithJunction.has(node.id)) continue;
      const marker = await buildNodeMarker(node);
      if (marker) {
        figma.currentPage.appendChild(marker);
        console.log(`[renderAll] appended marker for node ${node.id} at (${marker.x}, ${marker.y})`);
      }
    }
  }

  // Brings road infrastructure (roads, junctions, node markers) to the front of the
  // page z-order, in that relative order. Call before LineRenderer/StationRenderer's
  // own front-ordering so the final stacking (bottom to top) is:
  //   roads < junctions < node markers < line segments < stations
  // and all of it ends up above any non-plugin content on the page.
  public static bringInfraToFront(): void {
    const children = [...figma.currentPage.children];
    bringToFront(children, c =>
      c.getPluginData(FIGMA_KEY_ROAD_ID) !== '' &&
      c.getPluginData(FIGMA_KEY_IS_ROAD_CONTROL) !== 'true'
    );
    bringToFront(children, c =>
      c.type === 'FRAME' &&
      c.getPluginData(FIGMA_KEY_NODE_ID) !== '' &&
      c.getPluginData(FIGMA_KEY_IS_NODE_MARKER) !== 'true'
    );
    bringToFront(children, c => c.getPluginData(FIGMA_KEY_IS_NODE_MARKER) === 'true');
  }

  private static async clearPrevious(): Promise<void> {
    figma.currentPage.findAll(n => n.name === ROAD_NETWORK_GROUP_NAME).forEach(n => {
      if (!n.removed) n.remove();
    });
    const toRemove = figma.currentPage.children.filter(n =>
      n.getPluginData(FIGMA_KEY_NODE_ID) !== '' ||
      (n.getPluginData(FIGMA_KEY_ROAD_ID) !== '' && n.getPluginData(FIGMA_KEY_IS_ROAD_CONTROL) !== 'true')
    );
    for (const n of toRemove) {
      if (!n.removed) n.remove();
    }
  }

  // Removes only the road-visual nodes (section curves) belonging to the given road ids —
  // the scoped counterpart of clearPrevious's road half.
  private static clearRoads(roadIds: ReadonlySet<string>): void {
    if (roadIds.size === 0) return;
    const toRemove = figma.currentPage.children.filter(n => {
      const roadId = n.getPluginData(FIGMA_KEY_ROAD_ID);
      return roadId !== '' && roadIds.has(roadId) && n.getPluginData(FIGMA_KEY_IS_ROAD_CONTROL) !== 'true';
    });
    for (const n of toRemove) {
      if (!n.removed) n.remove();
    }
  }

  // Removes only the junction/marker nodes belonging to the given node ids — the scoped
  // counterpart of clearPrevious's node half.
  private static clearNodes(nodeIds: ReadonlySet<string>): void {
    if (nodeIds.size === 0) return;
    const toRemove = figma.currentPage.children.filter(n => {
      const nodeId = n.getPluginData(FIGMA_KEY_NODE_ID);
      return nodeId !== '' && nodeIds.has(nodeId);
    });
    for (const n of toRemove) {
      if (!n.removed) n.remove();
    }
  }
}
