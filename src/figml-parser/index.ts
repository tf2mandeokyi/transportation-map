import { FigmlNode, FigmlProps } from './types';
import { FrameRenderer } from './renderer/frame';
import { TextRenderer } from './renderer/text';
import { EllipseRenderer, PolygonRenderer, RectangleRenderer } from './renderer/shapes';
import { ImportRenderer } from './renderer/import';
import { BaseRenderer } from './renderer/base';
import { RenderResult } from './result';

export { FigmlNode } from './types';
export { FigmlParser } from './parser';

const FRAME = new FrameRenderer();
const TEXT = new TextRenderer();
const RECTANGLE = new RectangleRenderer();
const ELLIPSE = new EllipseRenderer();
const POLYGON = new PolygonRenderer();
const IMPORT = new ImportRenderer();

function chooseRenderer(tag: string): BaseRenderer {
  switch (tag) {
    case 'frame':     return FRAME;
    case 'text':      return TEXT;
    case 'rectangle': return RECTANGLE;
    case 'ellipse':   return ELLIPSE;
    case 'polygon':   return POLYGON;
    case 'import':    return IMPORT;
    default:
      throw new Error(`Unknown tag: ${tag}`);
  }
}

export function renderNode(node: FigmlNode, props: FigmlProps): RenderResult {
  const renderer = chooseRenderer(node.tag);
  return renderer.render(node, props);
}