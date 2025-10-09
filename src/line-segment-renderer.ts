import { Line, LineSegmentId, Station } from "./structures";
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
    // Create a unique ID for this line segment
    const segmentId = `${line.id}:${startStation.id}-${endStation.id}` as LineSegmentId;

    // Check if line already exists, otherwise create new one
    let lineNode = this.figmaLineSegmentMap.get(segmentId) as VectorNode | undefined;

    if (!lineNode) {
      lineNode = figma.createVector();
      lineNode.name = `Line: ${line.name} (${startStation.id} → ${endStation.id})`;
      this.figmaLineSegmentMap.set(segmentId, lineNode);
      figma.currentPage.appendChild(lineNode);
    }

    // Get the stored connection points for this line at both nodes
    const startPoint = this.stationRenderer.getConnectionPoint(startStation.id, line.id);
    const endPoint = this.stationRenderer.getConnectionPoint(endStation.id, line.id);

    if (!startPoint || !endPoint) {
      console.warn(`Missing connection points for line ${line.id} (${line.name})`
        + ` between ${startStation.id} (${startStation.name})`
        + ` and ${endStation.id} (${endStation.name})`);
      return;
    }

    // Calculate bezier curve control points for smooth curves
    const pathData = this.createBezierPath(startPoint, endPoint);

    // Build vector path with bezier curve
    lineNode.vectorPaths = [{
      windingRule: 'NONZERO',
      data: pathData
    }];

    // Apply line styling
    lineNode.strokes = [{
      type: 'SOLID',
      color: line.color
    }];
    lineNode.strokeWeight = 3;
    lineNode.strokeCap = 'ROUND';
    lineNode.strokeJoin = 'ROUND';
  }

  private createBezierPath(start: {x: number, y: number}, end: {x: number, y: number}): string {
    // Calculate the distance and direction between points
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Control point distance is proportional to the segment length
    // Adjust this factor (0.3) to control how "curvy" the lines are
    const controlDistance = distance * 0.3;

    // Determine the primary direction (horizontal vs vertical)
    const isHorizontal = Math.abs(dx) > Math.abs(dy);

    let cp1x: number, cp1y: number, cp2x: number, cp2y: number;

    if (isHorizontal) {
      // For horizontal segments, control points extend horizontally
      cp1x = start.x + controlDistance * Math.sign(dx);
      cp1y = start.y;
      cp2x = end.x - controlDistance * Math.sign(dx);
      cp2y = end.y;
    } else {
      // For vertical segments, control points extend vertically
      cp1x = start.x;
      cp1y = start.y + controlDistance * Math.sign(dy);
      cp2x = end.x;
      cp2y = end.y - controlDistance * Math.sign(dy);
    }

    // Create cubic bezier curve path - round coordinates to avoid Figma parsing errors
    return `M ${start.x} ${start.y} C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${end.x} ${end.y}`;
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
