import { FigmlRenderer } from ".";
import { RenderResult } from "./result";
import { StringTemplate } from "./template";

export type FigmlProps = Record<string, string | number | boolean | RGB | SceneNode | SceneNode[]>;

export type FigmlFrameAlignment = `${'left' | 'center' | 'right'},${'top' | 'center' | 'bottom'}`;

export interface FigmlNode {
  tag: string;
  attributes: Record<string, StringTemplate | undefined>;
  children: FigmlNode[];
  content?: StringTemplate;
}

export class FigmlComponent {
  props: Record<string, string>;
  variants: Record<string, FigmlNode>;

  constructor(props: Record<string, string>, variants: Record<string, FigmlNode>) {
    this.props = props;
    this.variants = variants;
  }

  render(props: FigmlProps, variantProps: Record<string, string> = {}): RenderResult {
    return FigmlRenderer.renderComponent(this, props, variantProps);
  }
}