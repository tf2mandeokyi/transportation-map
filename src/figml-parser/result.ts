import { ErrorChain } from "../error";

export class RenderResult {
  private readonly node: SceneNode;
  private readonly render: () => Promise<void>;

  private constructor(node: SceneNode, render: () => void | Promise<void>) {
    this.node = node;
    this.render = async () => await render();
  }

  static newNode(node: SceneNode, render: () => void | Promise<void>): RenderResult {
    return new RenderResult(node, render);
  }

  static newFrameNode(node: FrameNode, children: RenderResult[], render: () => void | Promise<void>): RenderResult {
    for (const child of children) {
      node.appendChild(child.node);
    }
    return new RenderResult(node, async () => {
      await render();
      await Promise.all(children.map(c =>
        c.render().catch(ErrorChain.thrower(`Error rendering child node ${c.node.type} of frame ${node.name}`))
      ));
    });
  }

  async intoNode(): Promise<SceneNode> {
    await this.render();
    return this.node;
  }
}