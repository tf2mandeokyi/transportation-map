import { MapState } from "../models/structures";
import { Model } from "../models";
import { StationRenderer } from "./station";
import { LineRenderer } from "./line";
import { RoadRenderer } from "./road";
import { ErrorChain } from "../error";

export class View {
  readonly stationRenderer: StationRenderer;
  readonly lineSegmentRenderer: LineRenderer;
  readonly roadRenderer: RoadRenderer;

  constructor() {
    this.stationRenderer = new StationRenderer();
    this.lineSegmentRenderer = new LineRenderer(this.stationRenderer);
    this.roadRenderer = new RoadRenderer();
  }

  public setModel(model: Model): void {
    this.stationRenderer.setModel(model);
    this.lineSegmentRenderer.setModel(model);
    this.roadRenderer.setModel(model);
  }

  public async render(state: Readonly<MapState>): Promise<void> {
    // 1. Draw road sections (bezier curves) — rendered first so they sit at the back
    await this.roadRenderer.renderAll(state)
      .catch(ErrorChain.thrower('Error rendering road network'));

    // 2. Clear connection points, then render stations on top of the road sections
    this.stationRenderer.clearConnectionPoints();
    await Promise.all([...state.stations.values()].map(station =>
      this.stationRenderer.renderStation(station, state)
        .catch(ErrorChain.thrower(`Error rendering station ${station.name}`))
    ));

    // 3. Render line segments using stored connection points
    await Promise.all([...state.lines.values()].map(line =>
      this.lineSegmentRenderer.renderLine(line, state)
        .catch(ErrorChain.thrower(`Error rendering line ${line.name}`))
    ));

    // 4. Move line segments behind stations (road sections are already at the very back)
    await this.lineSegmentRenderer.moveSegmentsToBack();
  }
}