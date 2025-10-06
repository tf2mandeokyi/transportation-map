import { FigmlNode } from './types';

export abstract class BaseRenderer {
  protected static interpolateValue(value: string, props: Record<string, any>): string {
    return value.replace(/\$\$prop:(\w+)\$\$/g, (match, propName) => {
      return props[propName] || match;
    });
  }

  protected static applyCommonAttributes(node: SceneNode, attributes: Record<string, string>, props: Record<string, any>) {
    if (attributes.width) {
      const width = this.interpolateValue(attributes.width, props);
      if (!isNaN(Number(width))) {
        const currentHeight = (node as any).height || 100;
        (node as any).resize?.(Number(width), currentHeight);
      }
    }

    if (attributes.height) {
      const height = this.interpolateValue(attributes.height, props);
      if (!isNaN(Number(height))) {
        const currentWidth = (node as any).width || 100;
        (node as any).resize?.(currentWidth, Number(height));
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

  abstract render(node: FigmlNode, props: Record<string, any>): Promise<SceneNode>;
}