import { FigmlComponent, FigmlNode, FigmlProps, RenderResult } from './types';
import { FrameRenderer } from './frame';
import { TextRenderer } from './text';
import { EllipseRenderer, PolygonRenderer, RectangleRenderer } from './shapes';
import { BaseRenderer } from './base';

export { FigmlComponent, FigmlNode } from './types';
export { FigmlParser } from './parser';

const FRAME = new FrameRenderer();
const TEXT = new TextRenderer();
const RECTANGLE = new RectangleRenderer();
const ELLIPSE = new EllipseRenderer();
const POLYGON = new PolygonRenderer();

function chooseRenderer(tag: string): BaseRenderer {
  switch (tag) {
    case 'frame':     return FRAME;
    case 'text':      return TEXT;
    case 'rectangle': return RECTANGLE;
    case 'ellipse':   return ELLIPSE;
    case 'polygon':   return POLYGON;
    default:
      throw new Error(`Unknown tag: ${tag}`);
  }
}

export function renderNode(node: FigmlNode, props: FigmlProps): RenderResult {
  const renderer = chooseRenderer(node.tag);
  return renderer.render(node, props);
}

export class FigmlRenderer {
  static renderComponent(component: FigmlComponent, props: FigmlProps, variant: string): RenderResult {
    const variantNode = component.variants[variant];
    if (!variantNode) {
      throw new Error(`Variant ${variant} not found`);
    }

    return renderNode(variantNode, props);
  }
}