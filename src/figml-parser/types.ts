import { renderNode } from ".";
import { RenderResult } from "./result";
import { StringTemplate } from "./template";

export type FigmlProps = Record<string, string | number | boolean | RGB | SceneNode | SceneNode[]>;

export type FigmlAlignment = `${'left' | 'center' | 'right'},${'top' | 'center' | 'bottom'}`;

export interface FigmlNode {
  tag: string;
  attributes: Record<string, StringTemplate | undefined>;
  children: FigmlNode[];
  content?: StringTemplate;
}

export class FigmlComponent {
  defaultProps: FigmlProps;
  variants: Record<string, FigmlNode>;

  constructor(defaultProps: FigmlProps, variants: Record<string, FigmlNode>) {
    this.defaultProps = defaultProps;
    this.variants = variants;
  }

  render(props: FigmlProps, variantProps: Record<string, string> = {}): RenderResult {
    const mergedProps = { ...this.defaultProps, ...props };
    
    // Build variant key from variant props
    const variantKey = Object.entries(variantProps)
      .map(([key, value]) => `${key}:${value}`)
      .join(',');

    const variantNode = this.variants[variantKey];
    if (!variantNode) {
      throw new Error(`Variant ${variantKey} not found`);
    }

    return renderNode(variantNode, mergedProps);
  }
}