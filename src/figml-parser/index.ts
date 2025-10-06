import { FigmlComponent, FigmlNode, RenderResult } from './types';
import { FrameRenderer } from './frame';
import { TextRenderer } from './text';
import { EllipseRenderer, PolygonRenderer, RectangleRenderer } from './shapes';

export { FigmlComponent, FigmlNode } from './types';
export { FigmlParser } from './parser';

export function renderNode(node: FigmlNode, props: Record<string, any>): RenderResult {
  switch (node.tag) {
    case 'frame':
      return new FrameRenderer().render(node, props);
    case 'text':
      return new TextRenderer().render(node, props);
    case 'rectangle':
      return new RectangleRenderer().render(node, props);
    case 'ellipse':
      return new EllipseRenderer().render(node, props);
    case 'polygon':
      return new PolygonRenderer().render(node, props);
    default:
      console.error(`Unknown tag: ${node.tag}, node:`, node);
      throw new Error(`Unknown tag: ${node.tag}`);
  }
}

export class FigmlRenderer {
  static renderComponent(component: FigmlComponent, props: Record<string, any>, variant: string): RenderResult {
    const variantNode = component.variants[variant];
    if (!variantNode) {
      throw new Error(`Variant ${variant} not found`);
    }

    return renderNode(variantNode, props);
  }
}