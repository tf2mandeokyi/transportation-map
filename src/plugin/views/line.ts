import { StationId, StationOrientation } from "../../common/types";
import { Line, Station } from "../models/structures";
import { Model } from "../models";
import { StationRenderer } from "./station";

interface BezierSegment {
  outline: VectorNode;
  main: VectorNode;
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

  public async clearAllSegments(): Promise<void> {
    if (!this.model) return;

    // Remove all line groups using the stored IDs in the model
    const state = this.model.getState();
    for (const line of state.lines.values()) {
      if (line.figmaGroupId) {
        try {
          const node = await figma.getNodeByIdAsync(line.figmaGroupId);
          if (node && !node.removed) {
            node.remove();
          }
        } catch {
          // Node doesn't exist anymore, that's fine
        }
      }
    }
  }

  public async renderLine(line: Line, stations: Map<StationId, Station>): Promise<void> {
    // Clean up old group if it exists (from previous render)
    await this.cleanupOldLineGroup(line);

    // Collect all segment nodes first
    // const segmentNodes: SceneNode[] = [];
    const outlineNodes: VectorNode[] = [];
    const mainNodes: VectorNode[] = [];

    // Draw bezier curve segments between consecutive nodes in the line's path
    for (let i = 0; i < line.path.length - 1; i++) {
      const startStationId = line.path[i];
      const endStationId = line.path[i + 1];

      const startStation = stations.get(startStationId);
      const endStation = stations.get(endStationId);

      if (!startStation || !endStation) continue;

      const segmentGroup = this.renderLineSegment(line, i, startStation, endStation);
      if (segmentGroup) {
        outlineNodes.push(segmentGroup.outline);
        mainNodes.push(segmentGroup.main);
      }

      if (i < line.path.length - 1) {
        // Also render a small segment at the end station to create a "dot" effect
        const middleSegment = this.renderMiddleSegment(line, i + 1, endStation);
        if (middleSegment) {
          outlineNodes.push(middleSegment.outline);
          mainNodes.push(middleSegment.main);
        }
      }
    }

    // Create parent group for this line only if we have segments
    if (outlineNodes.length > 0 && mainNodes.length > 0) {
      const outlineGroup = figma.group(outlineNodes, figma.currentPage);
      const mainGroup = figma.group(mainNodes, figma.currentPage);
      const lineGroup = figma.group([outlineGroup, mainGroup], figma.currentPage);
      lineGroup.name = `Line: ${line.name}`;
      lineGroup.locked = true; // Prevent accidental movement

      // Store the group ID in the model
      if (this.model) {
        this.model.updateLineFigmaGroupId(line.id, lineGroup.id);
      }
    }
  }

  private async cleanupOldLineGroup(line: Line): Promise<void> {
    // Remove old group using the stored ID in the model
    if (line.figmaGroupId) {
      try {
        const oldGroup = await figma.getNodeByIdAsync(line.figmaGroupId);
        if (oldGroup && !oldGroup.removed) {
          oldGroup.remove();
        }
      } catch {
        // Node doesn't exist anymore, that's fine
      }
    }
  }

  private renderLineSegment(line: Line, segmentIndex: number, startStation: Station, endStation: Station): BezierSegment | null {
    // Get the stored connection points for this line at both stations
    // segmentIndex is the index of the start station, segmentIndex + 1 is the index of the end station
    const startStationPoints = this.stationRenderer.getConnectionPoint(startStation.id, line.id, segmentIndex);
    const endStationPoints = this.stationRenderer.getConnectionPoint(endStation.id, line.id, segmentIndex + 1);

    if (!startStationPoints || !endStationPoints) {
      console.warn(`Missing connection points for line ${line.id} (${line.name})`
        + ` segment ${segmentIndex} between ${startStation.id} (${startStation.name})`
        + ` and ${endStation.id} (${endStation.name})`);
      return null;
    }

    // Calculate bezier curve control points for smooth curves based on station orientations
    const pathData = this.createBezierPath(startStationPoints.head, endStationPoints.tail, startStation, endStation);
    return this.bezierPathToSegments(pathData, line.color);
  }

  private renderMiddleSegment(line: Line, segmentIndex: number, station: Station): BezierSegment | null {
    // Get the stored connection points for this line at the station
    const stationPoints = this.stationRenderer.getConnectionPoint(station.id, line.id, segmentIndex);

    if (!stationPoints) {
      console.warn(`Missing connection points for line ${line.id} (${line.name}) segment ${segmentIndex} at station ${station.id} (${station.name})`);
      return null;
    }

    const pathData = this.createBezierPath(stationPoints.tail, stationPoints.head);
    return this.bezierPathToSegments(pathData, line.color);
  }

  private bezierPathToSegments(pathData: string, color: RGB): BezierSegment | null {
    // Create white outline (rendered first, so it's behind)
    const outlineNode = figma.createVector();
    outlineNode.vectorPaths = [{
      windingRule: 'NONZERO',
      data: pathData
    }];
    outlineNode.strokes = [{
      type: 'SOLID',
      color: { r: 1, g: 1, b: 1 }
    }];
    outlineNode.strokeWeight = 4;
    outlineNode.strokeCap = 'ROUND';
    outlineNode.strokeJoin = 'ROUND';

    // Create colored main line (rendered second, so it's on top)
    const mainNode = figma.createVector();
    mainNode.vectorPaths = [{
      windingRule: 'NONZERO',
      data: pathData
    }];
    mainNode.strokes = [{
      type: 'SOLID',
      color
    }];
    mainNode.strokeWeight = 2;
    mainNode.strokeCap = 'ROUND';
    mainNode.strokeJoin = 'ROUND';

    return { outline: outlineNode, main: mainNode };
  }

  private createBezierPath(
    start: {x: number, y: number},
    end: {x: number, y: number},
    startStation?: Station,
    endStation?: Station
  ): string {
    // Calculate the distance between points
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Control point distance is proportional to the segment length
    // Adjust this factor (0.3) to control how "curvy" the lines are
    const controlDistance = distance * 0.3;

    // Get control point offsets based on station orientations
    const startOffset = startStation ? this.getOrientationOffset(startStation.orientation, controlDistance) : { x: 0, y: 0 };
    const endOffset = endStation ? this.getOrientationOffset(endStation.orientation, controlDistance) : { x: 0, y: 0 };

    // Calculate control points based on station orientations
    const cp1x = start.x + startOffset.x;
    const cp1y = start.y + startOffset.y;
    const cp2x = end.x - endOffset.x;
    const cp2y = end.y - endOffset.y;

    // Create cubic bezier curve path
    return `M ${start.x} ${start.y} C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${end.x} ${end.y}`;
  }

  private getOrientationOffset(orientation: StationOrientation, distance: number): Vector {
    switch (orientation) {
      case 'RIGHT': return { x: distance, y: 0 };
      case 'LEFT': return { x: -distance, y: 0 };
      case 'DOWN': return { x: 0, y: distance };
      case 'UP': return { x: 0, y: -distance };
    }
  }

  public async moveSegmentsToBack(): Promise<void> {
    if (!this.model) return;

    // Move parent line groups to the back using stored IDs
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
        } catch {
          // Node doesn't exist anymore, that's fine
        }
      }
    }
  }
}
