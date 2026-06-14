import { MapState } from "../models/structures";
import { Model } from "../models";
import { StationRenderer } from "./station";
import { LineRenderer } from "./line";
import { RoadRenderer } from "./road";
import { ErrorChain } from "../error";

export class View {
  readonly stationRenderer: StationRenderer;
  readonly lineSegmentRenderer: LineRenderer;
  public isRendering = false;

  constructor() {
    this.stationRenderer = new StationRenderer();
    this.lineSegmentRenderer = new LineRenderer(this.stationRenderer);
  }

  public setModel(model: Model): void {
    this.stationRenderer.setModel(model);
    this.lineSegmentRenderer.setModel(model);
  }

  public async render(state: Readonly<MapState>): Promise<void> {
    this.isRendering = true;
    try {
      // 1. Draw road sections (bezier curves) — rendered first so they sit at the back
      await RoadRenderer.renderAll(state)
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

      // 4. Move line segments behind stations
      await this.lineSegmentRenderer.moveSegmentsToBack();

      // 5. Move all road infrastructure (roads, junctions, node markers) to the very back
      //    so they sit below line segments and stations.
      RoadRenderer.moveAllToBack();
    } finally {
      this.isRendering = false;
    }
  }
}
