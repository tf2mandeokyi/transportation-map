import { FigmlComponent, FigmlNode } from './types';
import { FrameRenderer } from './frame';
import { TextRenderer } from './text';
import { EllipseRenderer, PolygonRenderer, RectangleRenderer } from './shapes';

export { FigmlComponent, FigmlNode } from './types';
export { FigmlParser } from './parser';

export async function renderNode(node: FigmlNode, props: Record<string, any>): Promise<SceneNode> {
  switch (node.tag) {
    case 'frame':
      return await new FrameRenderer().render(node, props);
    case 'text':
      return await new TextRenderer().render(node, props);
    case 'rectangle':
      return await new RectangleRenderer().render(node, props);
    case 'ellipse':
      return await new EllipseRenderer().render(node, props);
    case 'polygon':
      return await new PolygonRenderer().render(node, props);
    default:
      throw new Error(`Unknown tag: ${node.tag}`);
  }
}

export class FigmlRenderer {
  static async renderComponent(
    component: FigmlComponent,
    props: Record<string, any>,
    variant: string
  ): Promise<SceneNode> {
    const variantNode = component.variants[variant];
    if (!variantNode) {
      throw new Error(`Variant ${variant} not found`);
    }

    return await renderNode(variantNode, props);
  }
}