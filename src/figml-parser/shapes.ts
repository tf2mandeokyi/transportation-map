import { FigmlNode, RenderResult } from './types';
import { BaseRenderer } from './base';

export class RectangleRenderer extends BaseRenderer {
  render(node: FigmlNode, props: Record<string, any>): RenderResult {
    const rect = figma.createRectangle();
    return { node: rect, render: async () => {
      BaseRenderer.applyCommonAttributes(rect, node.attributes, props);
      this.applyShapeAttributes(rect, node.attributes, props);
    }};
  }

  private applyShapeAttributes(shape: any, attributes: Record<string, string>, props: Record<string, any>) {
    if (attributes.fill) {
      const fill = BaseRenderer.interpolateValue(attributes.fill, props);
      shape.fills = [{ type: 'SOLID', color: BaseRenderer.hexToRgb(fill) }];
    }

    if (attributes.stroke) {
      const stroke = BaseRenderer.interpolateValue(attributes.stroke, props);
      shape.strokes = [{ type: 'SOLID', color: BaseRenderer.hexToRgb(stroke) }];
    } else {
      // Explicitly remove strokes when none specified
      shape.strokes = [];
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
  render(node: FigmlNode, props: Record<string, any>): RenderResult {
    const ellipse = figma.createEllipse();
    return { node: ellipse, render: async () => {
      BaseRenderer.applyCommonAttributes(ellipse, node.attributes, props);
      this.applyShapeAttributes(ellipse, node.attributes, props);
    }};
  }

  private applyShapeAttributes(shape: any, attributes: Record<string, string>, props: Record<string, any>) {
    if (attributes.fill) {
      const fill = BaseRenderer.interpolateValue(attributes.fill, props);
      shape.fills = [{ type: 'SOLID', color: BaseRenderer.hexToRgb(fill) }];
    }

    if (attributes.stroke) {
      const stroke = BaseRenderer.interpolateValue(attributes.stroke, props);
      shape.strokes = [{ type: 'SOLID', color: BaseRenderer.hexToRgb(stroke) }];
    } else {
      // Explicitly remove strokes when none specified
      shape.strokes = [];
    }

    if (attributes.strokeWeight) {
      const strokeWeight = BaseRenderer.interpolateValue(attributes.strokeWeight, props);
      shape.strokeWeight = Number(strokeWeight);
    }
  }
}

export class PolygonRenderer extends BaseRenderer {
  render(node: FigmlNode, props: Record<string, any>): RenderResult {
    const shape = this.createShape(node, props);
    return { node: shape, render: async () => {
      BaseRenderer.applyCommonAttributes(shape, node.attributes, props);
      this.applyShapeAttributes(shape, node.attributes, props);
    }};
  }

  private createShape(node: FigmlNode, props: Record<string, any>): VectorNode | PolygonNode {
    if (node.attributes.points) {
      const pointsStr = BaseRenderer.interpolateValue(node.attributes.points, props);
      const vectorNetwork = this.parsePolygonPoints(pointsStr);
      if (vectorNetwork) {
        const vector = figma.createVector();
        vector.setVectorNetworkAsync(vectorNetwork);
        return vector;
      }
    }
    return figma.createPolygon();
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

  private applyShapeAttributes(shape: any, attributes: Record<string, string>, props: Record<string, any>) {
    if (attributes.fill) {
      const fill = BaseRenderer.interpolateValue(attributes.fill, props);
      shape.fills = [{ type: 'SOLID', color: BaseRenderer.hexToRgb(fill) }];
    }

    if (attributes.stroke) {
      const stroke = BaseRenderer.interpolateValue(attributes.stroke, props);
      shape.strokes = [{ type: 'SOLID', color: BaseRenderer.hexToRgb(stroke) }];
    } else {
      // Explicitly remove strokes when none specified
      shape.strokes = [];
    }

    if (attributes.strokeWeight) {
      const strokeWeight = BaseRenderer.interpolateValue(attributes.strokeWeight, props);
      shape.strokeWeight = Number(strokeWeight);
    }
  }
}