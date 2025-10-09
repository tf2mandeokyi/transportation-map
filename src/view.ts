import { MapState } from "./structures";
import { Model } from "./model";
import { StationRenderer } from "./renderer/station-renderer";
import { LineSegmentRenderer } from "./renderer/line-segment-renderer";

export class View {
  private model?: Model;
  private stationRenderer: StationRenderer;
  private lineSegmentRenderer: LineSegmentRenderer;

  constructor() {
    this.stationRenderer = new StationRenderer();
    this.lineSegmentRenderer = new LineSegmentRenderer(this.stationRenderer);
  }

  public setModel(model: Model): void {
    this.model = model;
    this.stationRenderer.setModel(model);
  }

  public async render(state: Readonly<MapState>): Promise<void> {
    // Clear old line segments and connection points
    this.lineSegmentRenderer.clearAllSegments();
    this.stationRenderer.clearConnectionPoints();

    // First render all stations to calculate and store connection points
    await Promise.all([...state.stations.values()].map(station =>
      this.stationRenderer.renderStation(station, state)
    ));

    // Then render ALL lines using the stored connection points (with bezier curves)
    await Promise.all([...state.lines.values()].map(line =>
      this.lineSegmentRenderer.renderLine(line, state.stations)
    ));

    // Finally, move all line segments to the back so they appear behind stations
    this.lineSegmentRenderer.moveSegmentsToBack();
  }
}