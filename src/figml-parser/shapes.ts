import { FigmlNode, FigmlProps } from './types';
import { BaseRenderer } from './base';
import { RenderResult } from './result';

export class RectangleRenderer extends BaseRenderer {
  render(node: FigmlNode, props: FigmlProps): RenderResult {
    const rect = figma.createRectangle();
    return RenderResult.newNode(rect, () => {
      BaseRenderer.applyCommonAttributes(rect, node.attributes, props);
      this.applyShapeAttributes(rect, node.attributes, props);
    });
  }

  private applyShapeAttributes(shape: RectangleNode, attributes: Record<string, string>, props: FigmlProps) {
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
  render(node: FigmlNode, props: FigmlProps): RenderResult {
    const ellipse = figma.createEllipse();
    return RenderResult.newNode(ellipse, () => {
      BaseRenderer.applyCommonAttributes(ellipse, node.attributes, props);
      this.applyShapeAttributes(ellipse, node.attributes, props);
    });
  }

  private applyShapeAttributes(shape: EllipseNode, attributes: Record<string, string>, props: FigmlProps) {
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
  render(node: FigmlNode, props: FigmlProps): RenderResult {
    const shapeResult = this.createShape(node, props);
    if (shapeResult.type === 'vector') {
      const { shape, vectorNetwork } = shapeResult;
      return RenderResult.newNode(shape, async () => {
        await shape.setVectorNetworkAsync(vectorNetwork);
        BaseRenderer.applyCommonAttributes(shape, node.attributes, props);
        this.applyShapeAttributes(shape, node.attributes, props);
      });
    } else {
      const { shape } = shapeResult;
      return RenderResult.newNode(shape, () => {
        BaseRenderer.applyCommonAttributes(shape, node.attributes, props);
        this.applyShapeAttributes(shape, node.attributes, props);
      });
    }
  }

  private createShape(node: FigmlNode, props: FigmlProps): {
    type: 'vector', shape: VectorNode, vectorNetwork: VectorNetwork
  } | {
    type: 'polygon', shape: PolygonNode
  } { 
    if (node.attributes.points) {
      const pointsStr = BaseRenderer.interpolateValue(node.attributes.points, props);
      const vectorNetwork = this.parsePolygonPoints(pointsStr);
      if (vectorNetwork) {
        return { type: 'vector', shape: figma.createVector(), vectorNetwork: vectorNetwork };
      }
    }
    return { type: 'polygon', shape: figma.createPolygon() };
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

  private applyShapeAttributes(shape: VectorNode | PolygonNode, attributes: Record<string, string>, props: FigmlProps) {
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