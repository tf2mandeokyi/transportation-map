import { FigmlNode } from './types';
import { BaseRenderer } from './base';

export class RectangleRenderer extends BaseRenderer {
  async render(node: FigmlNode, props: Record<string, any>): Promise<RectangleNode> {
    const rect = figma.createRectangle();
    await Promise.all([
      BaseRenderer.applyCommonAttributes(rect, node.attributes, props),
      this.applyShapeAttributes(rect, node.attributes, props)
    ]);
    return rect;
  }

  private async applyShapeAttributes(shape: any, attributes: Record<string, string>, props: Record<string, any>): Promise<void> {
    if (attributes.fill) {
      const fill = BaseRenderer.interpolateValue(attributes.fill, props);
      shape.fills = [{ type: 'SOLID', color: BaseRenderer.hexToRgb(fill) }];
    }

    if (attributes.stroke) {
      const stroke = BaseRenderer.interpolateValue(attributes.stroke, props);
      shape.strokes = [{ type: 'SOLID', color: BaseRenderer.hexToRgb(stroke) }];
    }

    if (attributes.strokeWeight) {
      const strokeWeight = BaseRenderer.interpolateValue(attributes.strokeWeight, props);
      shape.strokeWeight = Number(strokeWeight);
    }

    if (attributes.cornerRadius && shape.cornerRadius !== undefined) {
      const cornerRadius = BaseRenderer.interpolateValue(attributes.cornerRadius, props);
      shape.cornerRadius = Number(cornerRadius);
    }
  }
}

export class EllipseRenderer extends BaseRenderer {
  async render(node: FigmlNode, props: Record<string, any>): Promise<EllipseNode> {
    const ellipse = figma.createEllipse();
    await Promise.all([
      BaseRenderer.applyCommonAttributes(ellipse, node.attributes, props),
      this.applyShapeAttributes(ellipse, node.attributes, props)
    ]);
    return ellipse;
  }

  private async applyShapeAttributes(shape: any, attributes: Record<string, string>, props: Record<string, any>): Promise<void> {
    if (attributes.fill) {
      const fill = BaseRenderer.interpolateValue(attributes.fill, props);
      shape.fills = [{ type: 'SOLID', color: BaseRenderer.hexToRgb(fill) }];
    }

    if (attributes.stroke) {
      const stroke = BaseRenderer.interpolateValue(attributes.stroke, props);
      shape.strokes = [{ type: 'SOLID', color: BaseRenderer.hexToRgb(stroke) }];
    }

    if (attributes.strokeWeight) {
      const strokeWeight = BaseRenderer.interpolateValue(attributes.strokeWeight, props);
      shape.strokeWeight = Number(strokeWeight);
    }
  }
}

export class PolygonRenderer extends BaseRenderer {
  async render(node: FigmlNode, props: Record<string, any>): Promise<VectorNode | PolygonNode> {
    if (node.attributes.points) {
      const pointsStr = BaseRenderer.interpolateValue(node.attributes.points, props);
      const vectorNetwork = this.parsePolygonPoints(pointsStr);
      if (vectorNetwork) {
        const vector = figma.createVector();
        await Promise.all([
          vector.setVectorNetworkAsync(vectorNetwork),
          BaseRenderer.applyCommonAttributes(vector, node.attributes, props),
          this.applyShapeAttributes(vector, node.attributes, props)
        ]);
        return vector;
      }
    }

    const polygon = figma.createPolygon();
    await Promise.all([
      BaseRenderer.applyCommonAttributes(polygon, node.attributes, props),
      this.applyShapeAttributes(polygon, node.attributes, props)
    ]);
    return polygon;
  }

  private parsePolygonPoints(pointsStr: string): VectorNetwork | null {
    try {
      const coordinates = pointsStr.trim().split(/\s+/);
      const vertices: VectorVertex[] = [];
      const segments: VectorSegment[] = [];

      for (let i = 0; i < coordinates.length; i++) {
        const [x, y] = coordinates[i].split(',').map(Number);
        vertices.push({ x: x, y: y });
      }

      for (let i = 0; i < vertices.length; i++) {
        const nextIndex = (i + 1) % vertices.length;
        segments.push({ start: i, end: nextIndex });
      }

      return {
        vertices: vertices,
        segments: segments,
        regions: [{
          windingRule: "NONZERO",
          loops: [[...Array(segments.length).keys()]]
        }]
      };
    } catch (error) {
      console.warn('Failed to parse polygon points:', pointsStr, error);
      return null;
    }
  }

  private async applyShapeAttributes(shape: any, attributes: Record<string, string>, props: Record<string, any>): Promise<void> {
    if (attributes.fill) {
      const fill = BaseRenderer.interpolateValue(attributes.fill, props);
      shape.fills = [{ type: 'SOLID', color: BaseRenderer.hexToRgb(fill) }];
    }

    if (attributes.stroke) {
      const stroke = BaseRenderer.interpolateValue(attributes.stroke, props);
      shape.strokes = [{ type: 'SOLID', color: BaseRenderer.hexToRgb(stroke) }];
    }

    if (attributes.strokeWeight) {
      const strokeWeight = BaseRenderer.interpolateValue(attributes.strokeWeight, props);
      shape.strokeWeight = Number(strokeWeight);
    }
  }
}