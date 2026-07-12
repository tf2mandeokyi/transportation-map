import { NodeId } from "@/common/types";
import { Model } from "../../models";
import { renderRadiusHandle } from "../../figmls";
import { FIGMA_KEY_NODE_ID } from "../../views/road";
import { absoluteOrigin } from "../../utils/math";

export const FIGMA_KEY_IS_NODE_CONTROL = 'isNodeControl';
export const FIGMA_KEY_RADIUS_HANDLE   = 'mapRadiusHandle';
const FIGMA_KEY_NODE_ID_CONTROL        = 'mapNodeControlNodeId';

// Node editing mode: a single resizable, aspect-locked circle handle centered on
// node.position whose diameter is the editable node.radius. Entered by clicking
// the node (or its junction polygon) — separate from road editing mode, which
// never touches radius.
export class NodeControlManager {
  private controlledNodeId: NodeId | null = null;
  private handleId: string | null = null;
  private lockedAnchorId: string | null = null;
  private dirty = false;
  public suppressNextControlChanges = false;

  constructor(private readonly model: Model) {}

  get activeNodeId(): NodeId | null { return this.controlledNodeId; }

  // True once the radius handle has actually resized the node's model radius — the
  // junction/marker visual (drawn by RoadRenderer) isn't updated live during the
  // resize, so it needs a real render() to catch up once editing ends, but only if
  // it's actually stale.
  get isDirty(): boolean { return this.dirty; }

  isControlElement(id: string): boolean {
    return this.handleId === id;
  }

  async activate(nodeId: NodeId): Promise<void> {
    await this.remove();

    const node = this.model.state.getNode(nodeId);
    if (!node) return;

    const diameter = node.radius * 2;
    const handle = await renderRadiusHandle({ diameter }).intoNode() as EllipseNode;
    handle.x = node.position.x - node.radius;
    handle.y = node.position.y - node.radius;
    handle.name = `Radius: ${node.name ?? node.id}`;
    handle.setPluginData(FIGMA_KEY_NODE_ID_CONTROL, nodeId);
    handle.setPluginData(FIGMA_KEY_IS_NODE_CONTROL, 'true');
    handle.setPluginData(FIGMA_KEY_RADIUS_HANDLE, 'radius');

    // Keep the handle just behind the node's marker/junction in z-order, and lock
    // that marker/junction for the duration of editing so it can't be dragged too —
    // with it locked, clicks fall straight through to the handle underneath, leaving
    // exactly one interactive element (the handle) for both moving and resizing.
    const anchor = figma.currentPage.children.find(n =>
      n.id !== handle.id && n.getPluginData(FIGMA_KEY_NODE_ID) === nodeId
    );
    if (anchor) {
      figma.currentPage.insertChild(figma.currentPage.children.indexOf(anchor), handle);
      anchor.locked = true;
      this.lockedAnchorId = anchor.id;
    } else {
      figma.currentPage.appendChild(handle);
    }

    this.controlledNodeId = nodeId;
    this.handleId = handle.id;
    this.suppressNextControlChanges = true;
  }

  async remove(): Promise<void> {
    if (this.handleId) {
      const node = await figma.getNodeByIdAsync(this.handleId);
      if (node && !node.removed) node.remove();
    }
    this.handleId = null;
    await this.unlockAnchor();
    this.controlledNodeId = null;
    this.dirty = false;
  }

  cleanup(): void {
    figma.currentPage
      .findAll(n => n.getPluginData(FIGMA_KEY_IS_NODE_CONTROL) === 'true')
      .forEach(n => { if (!n.removed) n.remove(); });
    this.handleId = null;
    if (this.lockedAnchorId) {
      const anchor = figma.currentPage.children.find(n => n.id === this.lockedAnchorId);
      if (anchor && !anchor.removed) anchor.locked = false;
    }
    this.lockedAnchorId = null;
    this.controlledNodeId = null;
    this.dirty = false;
  }

  private async unlockAnchor(): Promise<void> {
    if (!this.lockedAnchorId) return;
    const anchor = await figma.getNodeByIdAsync(this.lockedAnchorId);
    if (anchor && !anchor.removed) (anchor as SceneNode).locked = false;
    this.lockedAnchorId = null;
  }

  // Radius is read back as max(w, h)/2 as a fallback in case the aspect-ratio lock
  // didn't hold (e.g. a non-uniform scale), even though the handle is rendered with
  // lockAspectRatio="true" so w === h in the common case.
  async onRadiusHandleResized(nodeId: NodeId, handle: EllipseNode): Promise<void> {
    const node = this.model.state.getNode(nodeId);
    if (!node) return;

    const radius = Math.max(handle.width, handle.height) / 2;
    const origin = absoluteOrigin(handle);
    const centerX = origin.x + handle.width / 2;
    const centerY = origin.y + handle.height / 2;

    node.radius = radius;
    this.dirty = true;

    // Re-center the handle on the node's (unchanged) position and correct any drift
    // from a non-uniform resize back to a perfect circle.
    handle.resize(radius * 2, radius * 2);
    handle.x = centerX - radius;
    handle.y = centerY - radius;
  }
}
