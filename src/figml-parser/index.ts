import { FigmlComponent, FigmlNode, FigmlProps } from './types';
import { FrameRenderer } from './frame';
import { TextRenderer } from './text';
import { EllipseRenderer, PolygonRenderer, RectangleRenderer } from './shapes';
import { BaseRenderer } from './base';
import { RenderResult } from './result';

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
  static renderComponent(component: FigmlComponent, props: FigmlProps, variantProps: Record<string, string>): RenderResult {
    // Build variant key from variant props
    const variantKey = Object.entries(variantProps)
      .map(([key, value]) => `${key}:${value}`)
      .join(',');

    console.log("Rendering variant:", variantKey, "out of ", component.variants);
    const variantNode = component.variants[variantKey];
    if (!variantNode) {
      throw new Error(`Variant ${variantKey} not found`);
    }

    return renderNode(variantNode, props);
  }
}