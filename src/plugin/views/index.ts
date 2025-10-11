import { MapState } from "../models/structures";
import { Model } from "../models";
import { StationRenderer } from "./station";
import { LineRenderer } from "./line";
import { ErrorChain } from "../error";

export class View {
  readonly stationRenderer: StationRenderer;
  readonly lineSegmentRenderer: LineRenderer;

  constructor() {
    this.stationRenderer = new StationRenderer();
    this.lineSegmentRenderer = new LineRenderer(this.stationRenderer);
  }

  public setModel(model: Model): void {
    this.stationRenderer.setModel(model);
    this.lineSegmentRenderer.setModel(model);
  }

  public async render(state: Readonly<MapState>): Promise<void> {
    // Clear connection points to recalculate them
    this.stationRenderer.clearConnectionPoints();

    // First render all stations to calculate and store connection points
    await Promise.all([...state.stations.values()].map(station =>
      this.stationRenderer.renderStation(station, state)
        .catch(ErrorChain.thrower(`Error rendering station ${station.name}`))
    ));

    // Then render ALL lines using the stored connection points (with bezier curves)
    // Each line will clean up its own old group before rendering
    await Promise.all([...state.lines.values()].map(line =>
      this.lineSegmentRenderer.renderLine(line, state.stations)
        .catch(ErrorChain.thrower(`Error rendering line ${line.name}`))
    ));

    // Finally, move all line segments to the back so they appear behind stations
    await this.lineSegmentRenderer.moveSegmentsToBack();
  }
}