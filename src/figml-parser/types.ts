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

export interface RenderResult {
  node: SceneNode;
  
  render: () => Promise<void>;
}