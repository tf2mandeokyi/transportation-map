import { MapState } from "./structures";
import { Model } from "./model";
import { StationRenderer } from "./renderer/station";
import { LineRenderer } from "./renderer/line";
import { ErrorChain } from "./error";

export class View {
  private stationRenderer: StationRenderer;
  private lineSegmentRenderer: LineRenderer;

  constructor() {
    this.stationRenderer = new StationRenderer();
    this.lineSegmentRenderer = new LineRenderer(this.stationRenderer);
  }

  public setModel(model: Model): void {
    this.stationRenderer.setModel(model);
    this.lineSegmentRenderer.setModel(model);
  }

  public async render(state: Readonly<MapState>): Promise<void> {
    // Clear old line segments and connection points
    await this.lineSegmentRenderer.clearAllSegments();
    this.stationRenderer.clearConnectionPoints();

    // First render all stations to calculate and store connection points
    await Promise.all([...state.stations.values()].map(station =>
      this.stationRenderer.renderStation(station, state)
        .catch(ErrorChain.thrower(`Error rendering station ${station.name}`))
    ));

    // Then render ALL lines using the stored connection points (with bezier curves)
    await Promise.all([...state.lines.values()].map(line =>
      this.lineSegmentRenderer.renderLine(line, state.stations)
        .catch(ErrorChain.thrower(`Error rendering line ${line.name}`))
    ));

    // Finally, move all line segments to the back so they appear behind stations
    await this.lineSegmentRenderer.moveSegmentsToBack();
  }
}