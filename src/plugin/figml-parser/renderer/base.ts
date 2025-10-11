import { RenderResult } from '../result';
import { StringTemplate } from '../template';
import { FigmlNode, FigmlProps } from '../types';


export abstract class BaseRenderer {
  protected static applyCommonAttributes(node: SceneNode, attributes: Record<string, StringTemplate | undefined>, props: FigmlProps) {
    if (attributes.width) {
      const width = attributes.width.interpolate(props);
      try {
        if (width === 'hug') {
          if ('layoutSizingHorizontal' in node) node.layoutSizingHorizontal = 'HUG';
        } else if (width === 'fill') {
          if ('layoutSizingHorizontal' in node) node.layoutSizingHorizontal = 'FILL';
        } else if (!isNaN(Number(width))) {
          if ('layoutSizingHorizontal' in node) node.layoutSizingHorizontal = 'FIXED';
          (node as any).resize?.(Number(width), (node as any).height || 100);
        }
      } catch (error) {
        console.error(`Error setting layoutSizingHorizontal to ${width}:`, error);
      }
    }

    if (attributes.height) {
      const height = attributes.height.interpolate(props);
      try {
        if (height === 'hug') {
          if ('layoutSizingVertical' in node) node.layoutSizingVertical = 'HUG';
        } else if (height === 'fill') {
          if ('layoutSizingVertical' in node) node.layoutSizingVertical = 'FILL';
        } else if (!isNaN(Number(height))) {
          if ('layoutSizingVertical' in node) node.layoutSizingVertical = 'FIXED';
          (node as any).resize?.((node as any).width || 100, Number(height));
        }
      } catch (error) {
        console.error(`Error setting layoutSizingVertical to ${height}:`, error);
      }
    }

    if (attributes.name) {
      const name = attributes.name.interpolate(props);
      node.name = name;
    }

    if (attributes.rotation && 'rotation' in node) {
      const rotation = attributes.rotation.interpolate(props);
      if (!isNaN(Number(rotation))) {
        (node as any).rotation = Number(rotation);
      }
    }

    if (attributes.locked) {
      const locked = attributes.locked.interpolate(props);
      if (locked !== 'true' && locked !== 'false') {
        throw Error(`Invalid value for locked attribute: ${locked}. Expected 'true' or 'false'.`);
      }
      node.locked = locked === 'true';
    }
  }

  protected static applyVisibilityAttribute(node: SceneNode, attributes: Record<string, StringTemplate | undefined>, props: FigmlProps) {
    if (attributes.visible) {
      const visible = attributes.visible.interpolate(props);
      if (visible !== 'true' && visible !== 'false') {
        throw Error(`Invalid value for visible attribute: ${visible}. Expected 'true' or 'false'.`);
      }
      node.visible = visible === 'true';
    }
  }

  protected static hexToRgb(hex: string): RGB {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16) / 255,
      g: parseInt(result[2], 16) / 255,
      b: parseInt(result[3], 16) / 255
    } : { r: 0, g: 0, b: 0 };
  }

  abstract render(node: FigmlNode, props: FigmlProps): RenderResult;
}