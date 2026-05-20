import { RenderResult } from '../result';
import { StringTemplate } from '../template';
import { FigmlNode, FigmlProps } from '../types';


export abstract class BaseRenderer {
  protected static applyCommonAttributes(node: SceneNode, attributes: Record<string, StringTemplate | undefined>, props: FigmlProps) {
    const width = attributes.width?.interpolate(props);
    const height = attributes.height?.interpolate(props);
    const name = attributes.name?.interpolate(props);
    const rotation = attributes.rotation?.interpolate(props);
    const locked = attributes.locked?.interpolate(props);

    if (width) {
      try {
        if (width === 'hug') {
          if ('layoutSizingHorizontal' in node) node.layoutSizingHorizontal = 'HUG';
        } else if (width === 'fill') {
          if ('layoutSizingHorizontal' in node) node.layoutSizingHorizontal = 'FILL';
        } else if (!Number.isNaN(Number(width))) {
          if ('layoutSizingHorizontal' in node) node.layoutSizingHorizontal = 'FIXED';
          (node as any).resize?.(Number(width), (node as any).height || 100);
        }
      } catch (error) {
        console.error(`Error setting layoutSizingHorizontal to ${width}:`, error);
      }
    }

    if (height) {
      try {
        if (height === 'hug') {
          if ('layoutSizingVertical' in node) node.layoutSizingVertical = 'HUG';
        } else if (height === 'fill') {
          if ('layoutSizingVertical' in node) node.layoutSizingVertical = 'FILL';
        } else if (!Number.isNaN(Number(height))) {
          if ('layoutSizingVertical' in node) node.layoutSizingVertical = 'FIXED';
          (node as any).resize?.((node as any).width || 100, Number(height));
        }
      } catch (error) {
        console.error(`Error setting layoutSizingVertical to ${height}:`, error);
      }
    }

    if (name) {
      node.name = name;
    }

    if (rotation && 'rotation' in node) {
      if (!Number.isNaN(Number(rotation))) {
        (node as any).rotation = Number(rotation);
      }
    }

    if (locked) {
      if (locked !== 'true' && locked !== 'false') {
        throw new Error(`Invalid value for locked attribute: ${locked}. Expected 'true' or 'false'.`);
      }
      node.locked = locked === 'true';
    }
  }

  protected static applyVisibilityAttribute(node: SceneNode, attributes: Record<string, StringTemplate | undefined>, props: FigmlProps) {
    const visible = attributes.visible?.interpolate(props);

    if (visible) {
      if (visible !== 'true' && visible !== 'false') {
        throw new Error(`Invalid value for visible attribute: ${visible}. Expected 'true' or 'false'.`);
      }
      node.visible = visible === 'true';
    }
  }

  abstract render(node: FigmlNode, props: FigmlProps): RenderResult;
}