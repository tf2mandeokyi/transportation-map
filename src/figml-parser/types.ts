import { FigmlRenderer } from ".";
import { RenderResult } from "./result";

export type FigmlProps = Record<Exclude<string, 'children'>, any> & { children?: SceneNode | SceneNode[] };

export interface FigmlNode {
  tag: string;
  attributes: Record<string, string>;
  children: FigmlNode[];
  content?: string;
}

export class FigmlComponent {
  props: Record<string, string>;
  variants: Record<string, FigmlNode>;

  constructor(props: Record<string, string>, variants: Record<string, FigmlNode>) {
    this.props = props;
    this.variants = variants;
  }

  render(props: FigmlProps, variant: string): RenderResult {
    return FigmlRenderer.renderComponent(this, props, variant);
  }
}