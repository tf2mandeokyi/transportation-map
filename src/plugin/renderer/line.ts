import { createLineSegmentId, LineId, LineSegmentId, StationId, StationOrientation } from "../../common/types";
import { Line, Station } from "../structures";
import { Model } from "../model";
import { StationRenderer } from "./station";

export class LineRenderer {
  private figmaLineSegmentMap: Map<LineSegmentId, SceneNode> = new Map();
  private lineGroupMap: Map<LineId, GroupNode> = new Map();
  private stationRenderer: StationRenderer;
  private model: Model | null = null;

  constructor(stationRenderer: StationRenderer) {
    this.stationRenderer = stationRenderer;
  }

  public setModel(model: Model): void {
    this.model = model;
  }

  public clearAllSegments(): void {
    for (const [key, value] of this.figmaLineSegmentMap.entries()) {
      if (value && !value.removed) {
        value.remove();
      }
      this.figmaLineSegmentMap.delete(key);
    }

    for (const [key, value] of this.lineGroupMap.entries()) {
      if (value && !value.removed) {
        value.remove();
      }
      this.lineGroupMap.delete(key);
    }
  }

  public async renderLine(line: Line, stations: Map<StationId, Station>): Promise<void> {
    // Clean up old group if it exists (from previous render)
    await this.cleanupOldLineGroup(line);

    // Collect all segment nodes first
    const segmentNodes: SceneNode[] = [];

    // Draw bezier curve segments between consecutive nodes in the line's path
    for (let i = 0; i < line.path.length - 1; i++) {
      const startStationId = line.path[i];
      const endStationId = line.path[i + 1];

      const startStation = stations.get(startStationId);
      const endStation = stations.get(endStationId);

      if (!startStation || !endStation) continue;

      const segmentGroup = this.renderLineSegment(line, startStation, endStation);
      if (segmentGroup) {
        segmentNodes.push(segmentGroup);
      }
    }

    // Create parent group for this line only if we have segments
    if (segmentNodes.length > 0) {
      const lineGroup = figma.group(segmentNodes, figma.currentPage);
      lineGroup.name = `Line: ${line.name}`;
      this.lineGroupMap.set(line.id, lineGroup);

      // Store the group ID in the model
      if (this.model) {
        this.model.updateLineFigmaGroupId(line.id, lineGroup.id);
      }
    }
  }

  private async cleanupOldLineGroup(line: Line): Promise<void> {
    // Remove from memory map if exists
    const existingGroup = this.lineGroupMap.get(line.id);
    if (existingGroup && !existingGroup.removed) {
      existingGroup.remove();
    }
    this.lineGroupMap.delete(line.id);

    // Also try to remove group from Figma using stored ID
    if (line.figmaGroupId) {
      try {
        const oldGroup = await figma.getNodeByIdAsync(line.figmaGroupId);
        if (oldGroup && !oldGroup.removed) {
          oldGroup.remove();
        }
      } catch (error) {
        // Node doesn't exist anymore, that's fine
        console.log(`Old line group ${line.figmaGroupId} not found, probably already deleted`);
      }
    }
  }

  private renderLineSegment(line: Line, startStation: Station, endStation: Station): GroupNode | null {
    // Create unique ID for the segment group
    const segmentId = createLineSegmentId(line.id, startStation.id, endStation.id);

    // Get the stored connection points for this line at both nodes
    const startStationPoints = this.stationRenderer.getConnectionPoint(startStation.id, line.id);
    const endStationPoints = this.stationRenderer.getConnectionPoint(endStation.id, line.id);

    if (!startStationPoints || !endStationPoints) {
      console.warn(`Missing connection points for line ${line.id} (${line.name})`
        + ` between ${startStation.id} (${startStation.name})`
        + ` and ${endStation.id} (${endStation.name})`);
      return null;
    }

    // Calculate bezier curve control points for smooth curves based on station orientations
    const pathData = this.createBezierPath(startStationPoints.head, endStationPoints.tail, startStation, endStation);

    // Create white outline (rendered first, so it's behind)
    const outlineNode = figma.createVector();
    outlineNode.name = 'Outline';
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
    mainNode.name = 'Main';
    mainNode.vectorPaths = [{
      windingRule: 'NONZERO',
      data: pathData
    }];
    mainNode.strokes = [{
      type: 'SOLID',
      color: line.color
    }];
    mainNode.strokeWeight = 2;
    mainNode.strokeCap = 'ROUND';
    mainNode.strokeJoin = 'ROUND';

    // Add nodes to page first so we can group them
    figma.currentPage.appendChild(outlineNode);
    figma.currentPage.appendChild(mainNode);

    // Create segment group
    const segmentGroup = figma.group([outlineNode, mainNode], figma.currentPage);
    segmentGroup.name = `Segment: ${startStation.name} → ${endStation.name}`;
    this.figmaLineSegmentMap.set(segmentId, segmentGroup);

    return segmentGroup;
  }

  private createBezierPath(
    start: {x: number, y: number},
    end: {x: number, y: number},
    startStation: Station,
    endStation: Station
  ): string {
    // Calculate the distance between points
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Control point distance is proportional to the segment length
    // Adjust this factor (0.3) to control how "curvy" the lines are
    const controlDistance = distance * 0.3;

    // Get control point offsets based on station orientations
    const startOffset = this.getOrientationOffset(startStation.orientation, controlDistance);
    const endOffset = this.getOrientationOffset(endStation.orientation, controlDistance);

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

  public moveSegmentsToBack(): void {
    // Move parent line groups to the back
    for (const lineGroup of this.lineGroupMap.values()) {
      const parent = lineGroup.parent;
      if (parent && 'insertChild' in parent) {
        parent.insertChild(0, lineGroup);
      }
    }
  }
}
