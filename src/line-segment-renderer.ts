import { Line, LineSegmentId, Station, StationOrientation } from "./structures";
import { StationRenderer } from "./station-renderer";

export class LineSegmentRenderer {
  private figmaLineSegmentMap: Map<LineSegmentId, SceneNode> = new Map();
  private stationRenderer: StationRenderer;

  constructor(stationRenderer: StationRenderer) {
    this.stationRenderer = stationRenderer;
  }

  public clearAllSegments(): void {
    for (const [key, value] of this.figmaLineSegmentMap.entries()) {
      if (value && !value.removed) {
        value.remove();
      }
      this.figmaLineSegmentMap.delete(key);
    }
  }

  public async renderLine(line: Line, stations: Map<string, Station>): Promise<void> {
    // Draw bezier curve segments between consecutive nodes in the line's path
    for (let i = 0; i < line.path.length - 1; i++) {
      const startStationId = line.path[i];
      const endStationId = line.path[i + 1];

      const startStation = stations.get(startStationId);
      const endStation = stations.get(endStationId);

      if (!startStation || !endStation) continue;

      this.renderLineSegment(line, startStation, endStation);
    }
  }

  private renderLineSegment(line: Line, startStation: Station, endStation: Station): void {
    // Create unique ID for the segment group
    const segmentId = `${line.id}:${startStation.id}-${endStation.id}` as LineSegmentId;

    // Get the stored connection points for this line at both nodes
    const startPoint = this.stationRenderer.getConnectionPoint(startStation.id, line.id);
    const endPoint = this.stationRenderer.getConnectionPoint(endStation.id, line.id);

    if (!startPoint || !endPoint) {
      console.warn(`Missing connection points for line ${line.id} (${line.name})`
        + ` between ${startStation.id} (${startStation.name})`
        + ` and ${endStation.id} (${endStation.name})`);
      return;
    }

    // Calculate bezier curve control points for smooth curves based on station orientations
    const pathData = this.createBezierPath(startPoint, endPoint, startStation, endStation);

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

    // Create or update group for this segment
    let segmentGroup = this.figmaLineSegmentMap.get(segmentId) as GroupNode | undefined;
    if (!segmentGroup) {
      // Add nodes to page first
      figma.currentPage.appendChild(outlineNode);
      figma.currentPage.appendChild(mainNode);

      // Group them together
      segmentGroup = figma.group([outlineNode, mainNode], figma.currentPage);
      segmentGroup.name = `Line: ${line.name} (${startStation.id} → ${endStation.id})`;
      this.figmaLineSegmentMap.set(segmentId, segmentGroup);
    } else {
      // Clear existing children and add new ones
      segmentGroup.children.forEach(child => child.remove());
      segmentGroup.appendChild(outlineNode);
      segmentGroup.appendChild(mainNode);
    }
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

  private getOrientationOffset(orientation: StationOrientation, distance: number): {x: number, y: number} {
    switch (orientation) {
      case 'RIGHT': return { x: distance, y: 0 };
      case 'LEFT': return { x: -distance, y: 0 };
      case 'DOWN': return { x: 0, y: distance };
      case 'UP': return { x: 0, y: -distance };
    }
  }

  public moveSegmentsToBack(): void {
    for (const node of this.figmaLineSegmentMap.values()) {
      const parent = node.parent;
      if (parent && 'insertChild' in parent) {
        parent.insertChild(0, node);
      }
    }
  }
}
