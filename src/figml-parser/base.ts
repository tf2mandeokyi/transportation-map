import { FigmlNode, FigmlProps, RenderResult } from './types';

export abstract class BaseRenderer {
  protected static interpolateValue(value: string, props: FigmlProps): string {
    return value.replace(/\$\$prop:(\w+)\$\$/g, (match, propName) => {
      return props[propName] || match;
    });
  }

  protected static applyCommonAttributes(node: SceneNode, attributes: Record<string, string>, props: FigmlProps) {
    if (attributes.width) {
      const width = this.interpolateValue(attributes.width, props);
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
      const height = this.interpolateValue(attributes.height, props);
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

    if (attributes.visible) {
      const visible = this.interpolateValue(attributes.visible, props);
      node.visible = visible === 'true';
    }

    if (attributes.name) {
      const name = this.interpolateValue(attributes.name, props);
      node.name = name;
    }

    if (attributes.rotation && 'rotation' in node) {
      const rotation = this.interpolateValue(attributes.rotation, props);
      if (!isNaN(Number(rotation))) {
        (node as any).rotation = (Number(rotation) * Math.PI) / 180;
      }
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

  abstract render(node: FigmlNode, props: FigmlProps, stack: number): RenderResult;
}