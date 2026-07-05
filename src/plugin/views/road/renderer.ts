import { MapState } from "../../models/structures";
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
}
