import { MapState } from "../../models/structures";
import { renderRoad } from "./road-visuals";
import { buildAndAppendJunction, buildNodeMarker } from "./node-visuals";
import { FIGMA_KEY_NODE_ID, FIGMA_KEY_IS_NODE_MARKER, FIGMA_KEY_ROAD_ID, FIGMA_KEY_IS_ROAD_CONTROL } from "./constants";

// Legacy group name kept so old renders from previous sessions can be cleaned up.
const ROAD_NETWORK_GROUP_NAME = '_road-network';

function pushToBack(children: readonly SceneNode[], predicate: (c: SceneNode) => boolean): void {
  for (const child of children) {
    if (!child.removed && predicate(child)) figma.currentPage.insertChild(0, child);
  }
}

export class RoadRenderer {
  public static async renderAll(state: Readonly<MapState>): Promise<void> {
    await RoadRenderer.clearPrevious();
    for (const road of state.roads.values()) renderRoad(road, state);
    const nodesWithJunction = await RoadRenderer.renderJunctions(state);
    await RoadRenderer.renderNodeMarkers(state, nodesWithJunction);
  }

  private static async renderJunctions(state: Readonly<MapState>): Promise<Set<string>> {
    const nodesWithJunction = new Set<string>();
    for (const node of state.nodes.values()) {
      if (await buildAndAppendJunction(node, state)) nodesWithJunction.add(node.id);
    }
    return nodesWithJunction;
  }

  private static async renderNodeMarkers(state: Readonly<MapState>, nodesWithJunction: Set<string>): Promise<void> {
    for (const node of state.nodes.values()) {
      if (nodesWithJunction.has(node.id)) continue;
      const marker = await buildNodeMarker(node);
      if (marker) {
        figma.currentPage.appendChild(marker);
        console.log(`[renderAll] appended marker for node ${node.id} at (${marker.x}, ${marker.y})`);
      }
    }
  }

  // Pushes all road infrastructure (roads, junctions, node markers) to the back of the
  // page z-order so lines and stations appear on top.
  // Call after moveSegmentsToBack so the final stacking is:
  //   roads < junctions < node markers < line segments < stations
  public static moveAllToBack(): void {
    const children = [...figma.currentPage.children];
    // Push node markers first — they end up above junctions once junctions are pushed.
    pushToBack(children, c => c.getPluginData(FIGMA_KEY_IS_NODE_MARKER) === 'true');
    pushToBack(children, c => c.type === 'FRAME'   && c.getPluginData(FIGMA_KEY_NODE_ID) !== '');
    pushToBack(children, c =>
      c.getPluginData(FIGMA_KEY_ROAD_ID) !== '' &&
      c.getPluginData(FIGMA_KEY_IS_ROAD_CONTROL) !== 'true'
    );
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
