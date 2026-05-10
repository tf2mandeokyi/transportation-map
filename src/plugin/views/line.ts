import { HVAlign } from "../../common/types";
import { Line, MapState, Station } from "../models/structures";
import { Model } from "../models";
import { StationRenderer } from "./station";

interface BezierSegment {
  outline: VectorNode;
  main: VectorNode;
}

function hexToRgb(hex: string): RGB {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16) / 255,
    g: parseInt(result[2], 16) / 255,
    b: parseInt(result[3], 16) / 255
  } : { r: 1, g: 0, b: 0 };
}

export class LineRenderer {
  private stationRenderer: StationRenderer;
  private model: Model | null = null;

  constructor(stationRenderer: StationRenderer) {
    this.stationRenderer = stationRenderer;
  }

  public setModel(model: Model): void {
    this.model = model;
  }

  public async renderLine(line: Line, state: Readonly<MapState>): Promise<void> {
    await this.cleanupOldLineGroup(line);

    const segmentNodes: SceneNode[] = [];
    const color = hexToRgb(line.color);

    // Collect consecutive StationStop pairs to render bezier segments between them
    for (let i = 0; i < line.paths.length - 1; i++) {
      const current = line.paths[i];
      const next = line.paths[i + 1];

      if (current.kind !== 'station-stop' || next.kind !== 'station-stop') continue;

      const startStation = state.stations.get(current.stationId);
      const endStation = state.stations.get(next.stationId);
      if (!startStation || !endStation) continue;

      const outlineNodes: VectorNode[] = [];
      const mainNodes: VectorNode[] = [];

      const segment = this.renderLineSegment(line, i, startStation, endStation, color);
      if (segment) {
        outlineNodes.push(segment.outline);
        mainNodes.push(segment.main);
      }

      const middleSegment = this.renderMiddleSegment(line, i + 1, endStation, color);
      if (middleSegment) {
        outlineNodes.push(middleSegment.outline);
        mainNodes.push(middleSegment.main);
      }

      if (outlineNodes.length > 0) {
        segmentNodes.push(figma.group(outlineNodes, figma.currentPage));
        segmentNodes.push(figma.group(mainNodes, figma.currentPage));
      }
    }

    if (segmentNodes.length > 0) {
      const lineGroup = figma.group(segmentNodes, figma.currentPage);
      lineGroup.name = `Line: ${line.name}`;
      lineGroup.locked = true;

      if (this.model) {
        this.model.updateLineFigmaGroupId(line.id, lineGroup.id);
      }
    }
  }

  private async cleanupOldLineGroup(line: Line): Promise<void> {
    if (line.figmaGroupId) {
      try {
        const oldGroup = await figma.getNodeByIdAsync(line.figmaGroupId);
        if (oldGroup && !oldGroup.removed) oldGroup.remove();
      } catch {}
    }
  }

  private renderLineSegment(line: Line, segmentIndex: number, startStation: Station, endStation: Station, color: RGB): BezierSegment | null {
    const startPoints = this.stationRenderer.getConnectionPoint(startStation.id, line.id, segmentIndex);
    const endPoints = this.stationRenderer.getConnectionPoint(endStation.id, line.id, segmentIndex + 1);

    if (!startPoints || !endPoints) {
      console.warn(`Missing connection points for line ${line.id} segment ${segmentIndex}`);
      return null;
    }

    const pathData = this.createBezierPath(startPoints.head, endPoints.tail, startStation, endStation);
    return this.bezierPathToSegments(pathData, color);
  }

  private renderMiddleSegment(line: Line, segmentIndex: number, station: Station, color: RGB): BezierSegment | null {
    const points = this.stationRenderer.getConnectionPoint(station.id, line.id, segmentIndex);
    if (!points) return null;

    const pathData = this.createBezierPath(points.alignStart, points.alignEnd);
    return this.bezierPathToSegments(pathData, color);
  }

  private bezierPathToSegments(pathData: string, color: RGB): BezierSegment | null {
    const outlineNode = figma.createVector();
    outlineNode.vectorPaths = [{ windingRule: 'NONZERO', data: pathData }];
    outlineNode.strokes = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
    outlineNode.strokeWeight = 4;
    outlineNode.strokeCap = 'ROUND';
    outlineNode.strokeJoin = 'ROUND';

    const mainNode = figma.createVector();
    mainNode.vectorPaths = [{ windingRule: 'NONZERO', data: pathData }];
    mainNode.strokes = [{ type: 'SOLID', color }];
    mainNode.strokeWeight = 2;
    mainNode.strokeCap = 'ROUND';
    mainNode.strokeJoin = 'ROUND';

    return { outline: outlineNode, main: mainNode };
  }

  private createBezierPath(
    start: Vector,
    end: Vector,
    startStation?: Station,
    endStation?: Station
  ): string {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const controlDistance = distance * 0.3;

    const startOffset = startStation ? this.getTextAlignOffset(startStation.textAlign, controlDistance) : { x: 0, y: 0 };
    const endOffset = endStation ? this.getTextAlignOffset(endStation.textAlign, controlDistance) : { x: 0, y: 0 };

    const cp1x = start.x + startOffset.x;
    const cp1y = start.y + startOffset.y;
    const cp2x = end.x - endOffset.x;
    const cp2y = end.y - endOffset.y;

    return `M ${start.x} ${start.y} C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${end.x} ${end.y}`;
  }

  private getTextAlignOffset(textAlign: HVAlign, distance: number): Vector {
    // The dot side is opposite the text side; the bezier extends in the dot direction
    switch (textAlign) {
      case 'left':  return { x: -distance, y: 0 }; // dots on right → curve extends right
      case 'right': return { x: distance, y: 0 };  // dots on left → curve extends left... wait
      // Actually: textAlign 'right' means text is on right, dots are on left.
      // The connection head points away from the station (outward). Let's keep it simple:
      case 'bottom': return { x: 0, y: distance };
      case 'top':   return { x: 0, y: -distance };
    }
  }

  public async moveSegmentsToBack(): Promise<void> {
    if (!this.model) return;
    const state = this.model.getState();
    for (const line of state.lines.values()) {
      if (line.figmaGroupId) {
        try {
          const lineGroup = await figma.getNodeByIdAsync(line.figmaGroupId);
          if (lineGroup && !lineGroup.removed) {
            const parent = lineGroup.parent;
            if (parent && 'insertChild' in parent) {
              parent.insertChild(0, lineGroup as SceneNode);
            }
          }
        } catch {}
      }
    }
  }

  public async clearAllSegments(): Promise<void> {
    if (!this.model) return;
    const state = this.model.getState();
    for (const line of state.lines.values()) {
      if (line.figmaGroupId) {
        try {
          const node = await figma.getNodeByIdAsync(line.figmaGroupId);
          if (node && !node.removed) node.remove();
        } catch {}
      }
    }
  }
}
