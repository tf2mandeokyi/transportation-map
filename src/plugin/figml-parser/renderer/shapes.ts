import { FigmlNode, FigmlProps } from '../types';
import { BaseRenderer } from './base';
import { RenderResult } from '../result';
import { StringTemplate } from '../template';
import { hexToRgb } from '@/common/utils/color';

export class RectangleRenderer extends BaseRenderer {
  render(node: FigmlNode, props: FigmlProps): RenderResult {
    const rect = figma.createRectangle();
    return RenderResult.newNode(rect, () => {
      BaseRenderer.applyCommonAttributes(rect, node.attributes, props);
      this.applyShapeAttributes(rect, node.attributes, props);
    }, () => {
      BaseRenderer.applyVisibilityAttribute(rect, node.attributes, props);
    });
  }

  private applyShapeAttributes(shape: RectangleNode, attributes: Record<string, StringTemplate | undefined>, props: FigmlProps) {
    const fill = attributes.fill?.interpolate(props);
    const stroke = attributes.stroke?.interpolate(props);
    const strokeWeight = attributes.strokeWeight?.interpolate(props);
    const cornerRadius = attributes.cornerRadius?.interpolate(props);

    if (fill) {
      shape.fills = [{ type: 'SOLID', color: hexToRgb(fill) }];
    }

    if (stroke) {
      shape.strokes = [{ type: 'SOLID', color: hexToRgb(stroke) }];
    } else {
      // Explicitly remove strokes when none specified
      shape.strokes = [];
    }

    if (strokeWeight) {
      shape.strokeWeight = Number(strokeWeight);
    }

    if (cornerRadius && shape.cornerRadius !== undefined) {
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
    }, () => {
      BaseRenderer.applyVisibilityAttribute(ellipse, node.attributes, props);
    });
  }

  private applyShapeAttributes(shape: EllipseNode, attributes: Record<string, StringTemplate | undefined>, props: FigmlProps) {
    const fill = attributes.fill?.interpolate(props);
    const stroke = attributes.stroke?.interpolate(props);
    const strokeWeight = attributes.strokeWeight?.interpolate(props);

    if (fill) {
      shape.fills = [{ type: 'SOLID', color: hexToRgb(fill) }];
    }

    if (stroke) {
      shape.strokes = [{ type: 'SOLID', color: hexToRgb(stroke) }];
    } else {
      // Explicitly remove strokes when none specified
      shape.strokes = [];
    }

    if (strokeWeight) {
      shape.strokeWeight = Number(strokeWeight);
    }
  }
}

export class PolygonRenderer extends BaseRenderer {
  render(node: FigmlNode, props: FigmlProps): RenderResult {
    const shapeResult = this.createShape(node, props);
    let render: () => void | Promise<void>;
    if (shapeResult.type === 'vector') {
      const { shape, vectorNetwork } = shapeResult;
      render = async () => {
        await shape.setVectorNetworkAsync(vectorNetwork);
        BaseRenderer.applyCommonAttributes(shape, node.attributes, props);
        this.applyShapeAttributes(shape, node.attributes, props);
      };
    } else {
      const { shape } = shapeResult;
      render = () => {
        BaseRenderer.applyCommonAttributes(shape, node.attributes, props);
        this.applyShapeAttributes(shape, node.attributes, props);
      };
    }
    return RenderResult.newNode(shapeResult.shape, render, () => {
      BaseRenderer.applyVisibilityAttribute(shapeResult.shape, node.attributes, props);
    });
  }

  private createShape(node: FigmlNode, props: FigmlProps): {
    type: 'vector', shape: VectorNode, vectorNetwork: VectorNetwork
  } | {
    type: 'polygon', shape: PolygonNode
  } {
    const pointsStr = node.attributes.points?.interpolate(props);

    if (pointsStr) {
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

      for (const element of coordinates) {
        const [x, y] = element.split(',').map(Number);
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
          loops: [[...new Array(segments.length).keys()]]
        }]
      };
    } catch (error) {
      console.warn('Failed to parse polygon points:', pointsStr, error);
      return null;
    }
  }

  private applyShapeAttributes(shape: VectorNode | PolygonNode, attributes: Record<string, StringTemplate | undefined>, props: FigmlProps) {
    const fill = attributes.fill?.interpolate(props);
    const stroke = attributes.stroke?.interpolate(props);
    const strokeWeight = attributes.StrokeWeight?.interpolate(props);

    if (fill) {
      shape.fills = [{ type: 'SOLID', color: hexToRgb(fill) }];
    }

    if (stroke) {
      shape.strokes = [{ type: 'SOLID', color: hexToRgb(stroke) }];
    } else {
      // Explicitly remove strokes when none specified
      shape.strokes = [];
    }

    if (strokeWeight) {
      shape.strokeWeight = Number(strokeWeight);
    }
  }
}