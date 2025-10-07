export type FigmlProps = Record<Exclude<string, 'children'>, any> & { children?: SceneNode | SceneNode[] };

export interface FigmlNode {
  tag: string;
  attributes: Record<string, string>;
  children: FigmlNode[];
  content?: string;
}

export interface FigmlComponent {
  props: Record<string, string>;
  variants: Record<string, FigmlNode>;
}

export class RenderResult {
  private readonly node: SceneNode;
  private readonly render: () => void | Promise<void>;

  private constructor(node: SceneNode, render: () => void | Promise<void>) {
    this.node = node;
    this.render = render;
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
      for (const child of children) {
        // Although the return types are either void or Promise<void>,
        // we don't need to await here. This is for concurrency.
        child.render();
      }
    });
  }

  async intoNode(): Promise<SceneNode> {
    await this.render();
    return this.node;
  }
}