import { FigmlNode, RenderResult } from './types';

export abstract class BaseRenderer {
  protected static interpolateValue(value: string, props: Record<string, any>): string {
    return value.replace(/\$\$prop:(\w+)\$\$/g, (match, propName) => {
      return props[propName] || match;
    });
  }

  protected static applyCommonAttributes(node: SceneNode, attributes: Record<string, string>, props: Record<string, any>) {
    if (attributes.width) {
      const width = this.interpolateValue(attributes.width, props);
      try {
        if (width === 'hug' || width === 'fill') {
          // Only set layout sizing if node has an auto-layout parent
          if (this.hasAutoLayoutParent(node) && 'layoutSizingHorizontal' in node) {
            node.layoutSizingHorizontal = width === 'hug' ? 'HUG' : 'FILL';
          }
        } else if (!isNaN(Number(width))) {
          if (this.hasAutoLayoutParent(node) && 'layoutSizingHorizontal' in node) {
            node.layoutSizingHorizontal = 'FIXED';
          }
          (node as any).resize?.(Number(width), (node as any).height || 100);
        }
      } catch (error) {
        console.error(`Error setting layoutSizingHorizontal to ${width}:`, error);
      }
    }

    if (attributes.height) {
      const height = this.interpolateValue(attributes.height, props);
      try {
        if (height === 'hug' || height === 'fill') {
          // Only set layout sizing if node has an auto-layout parent
          if (this.hasAutoLayoutParent(node) && 'layoutSizingVertical' in node) {
            node.layoutSizingVertical = height === 'hug' ? 'HUG' : 'FILL';
          }
        } else if (!isNaN(Number(height))) {
          if (this.hasAutoLayoutParent(node) && 'layoutSizingVertical' in node) {
            node.layoutSizingVertical = 'FIXED';
          }
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

  protected static hasAutoLayoutParent(node: SceneNode): boolean {
    return node.parent != null &&
           node.parent.type === 'FRAME' &&
           (node.parent as FrameNode).layoutMode !== 'NONE';
  }

  protected static hexToRgb(hex: string): RGB {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16) / 255,
      g: parseInt(result[2], 16) / 255,
      b: parseInt(result[3], 16) / 255
    } : { r: 0, g: 0, b: 0 };
  }

  abstract render(node: FigmlNode, props: Record<string, any>): RenderResult;
}