import { ErrorChain } from "../error";

export class RenderResult {
  private readonly node: SceneNode;
  private readonly render: () => Promise<void>;
  private readonly applyVisibility: () => void;

  private constructor(node: SceneNode, render: () => void | Promise<void>, applyVisibility: () => void) {
    this.node = node;
    this.render = async () => await render();
    this.applyVisibility = applyVisibility;
  }

  static newNode(node: SceneNode, render: () => void | Promise<void>, applyVisibility: () => void): RenderResult {
    return new RenderResult(node, render, applyVisibility);
  }

  static newFrameNode(node: FrameNode, children: RenderResult[], render: () => void | Promise<void>, applyVisibility: () => void): RenderResult {
    for (const child of children) {
      node.appendChild(child.node);
    }
    return new RenderResult(node, async () => {
      await render();
      await Promise.all(children.map(c =>
        c.render().catch(ErrorChain.thrower(`Error rendering child node ${c.node.type} of frame ${node.name}`))
      ));
    }, () => {
      // Apply visibility to children first, then to the frame itself
      children.forEach(c => c.applyVisibility());
      applyVisibility();
    });
  }

  async intoNode(): Promise<SceneNode> {
    await this.render();
    this.applyVisibility();
    return this.node;
  }
}