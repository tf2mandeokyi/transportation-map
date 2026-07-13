import { NodeId, RoadId } from "@/common/types";
import { Line, MapState, Node, Road, Station } from "../models/structures";
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

  // Station positions are computed from the road model (Road.computeBezier), not read
  // back from the road's Figma nodes, so road geometry never needs to be torn down and
  // rebuilt just because a station or line was edited — { roads: false } skips that.
  public async render(state: Readonly<MapState>, { roads = true }: { roads?: boolean } = {}): Promise<void> {
    this.isRendering = true;
    try {
      // 1. Draw road sections (bezier curves) — rendered first so they sit at the back
      if (roads) {
        await RoadRenderer.renderAll(state)
          .catch(ErrorChain.thrower('Error rendering road network'));
      }

      // 2. Clear connection points, then render stations on top of the road sections
      this.stationRenderer.clearConnectionPoints();
      await Promise.all([...state.getStations()].map(station =>
        this.stationRenderer.renderStation(station)
          .catch(ErrorChain.thrower(`Error rendering station ${station.name}`))
      ));

      // 3. Render line segments (into the shared Lines frame) using stored connection points
      const linesFrame = this.lineSegmentRenderer.getOrCreateLinesFrame();
      await Promise.all([...state.getLines()].map(line =>
        this.lineSegmentRenderer.renderLine(line, linesFrame)
          .catch(ErrorChain.thrower(`Error rendering line ${line.name}`))
      ));

      // 4. Bring every plugin-rendered layer to the front of the page's z-order, in
      //    bottom-to-top order, so all plugin objects sit above any non-plugin content
      //    and the internal stacking is: roads < junctions/markers < line segments < stations.
      if (roads) RoadRenderer.bringInfraToFront();
      this.lineSegmentRenderer.bringLinesFrameToFront();
      this.stationRenderer.bringStationsToFront();
    } finally {
      this.isRendering = false;
    }
  }

  // Re-renders only the given roads/nodes/stations/lines plus whatever else they touch,
  // leaving the rest of the network untouched:
  //  - `roads`/`nodes` are the road/junction geometry to rebuild (n^0.5/n^1 below — see
  //    RoadRenderer.renderPartial for why a node's own connected roads plus the junctions
  //    those roads touch is always a closed set).
  //  - any station sitting on a dirty road gets re-rendered too, since a station's frame
  //    position is computed from its road's live bezier (Station.computePosition), not
  //    read back from a figma node — road geometry changing makes that station stale.
  //  - `stations` are extra stations to re-render outright (e.g. a station property
  //    edit with no road involved), and every station in the final touched set pulls in
  //    the lines it stops on, since a station's connection points (which line rendering
  //    reads back from `stationRenderer`) only depend on that station's own frame.
  // Every render category (roads, junctions/markers, lines, stations) lives inside its own
  // shared frame, so a z-order fixup is always the same single frame-level appendChild
  // regardless of how much of that category was actually touched — no need to distinguish
  // a full rebuild from a scoped one for front-ordering purposes.
  public async renderPartial(
    state: Readonly<MapState>,
    { stations = [], lines = [], roads = [], nodes = [], removedRoadIds = [], removedNodeIds = [] }:
      { stations?: Station[]; lines?: Line[]; roads?: Road[]; nodes?: Node[]; removedRoadIds?: readonly RoadId[]; removedNodeIds?: readonly NodeId[] },
  ): Promise<void> {
    this.isRendering = true;
    try {
      const networkChanged = roads.length > 0 || nodes.length > 0 || removedRoadIds.length > 0 || removedNodeIds.length > 0;
      if (networkChanged) {
        await RoadRenderer.renderPartial({ roads, nodes, removedRoadIds, removedNodeIds })
          .catch(ErrorChain.thrower('Error rendering road network'));
      }

      const touchedStations = new Map(stations.map(s => [s.id, s]));
      if (roads.length > 0) {
        const dirtyRoadIds = new Set(roads.map(r => r.id));
        for (const station of state.getStations()) {
          const road = station.parentRoadSection?.parentRoad;
          if (road && dirtyRoadIds.has(road.id)) touchedStations.set(station.id, station);
        }
      }

      const touchedLines = new Map(lines.map(l => [l.id, l]));
      for (const station of touchedStations.values()) {
        for (const { line } of station.getStopsAcrossLines()) touchedLines.set(line.id, line);
      }

      for (const station of touchedStations.values()) {
        this.stationRenderer.clearConnectionPointsFor(station);
      }
      await Promise.all([...touchedStations.values()].map(station =>
        this.stationRenderer.renderStation(station)
          .catch(ErrorChain.thrower(`Error rendering station ${station.name}`))
      ));

      const linesFrame = this.lineSegmentRenderer.getOrCreateLinesFrame();
      await Promise.all([...touchedLines.values()].map(line =>
        this.lineSegmentRenderer.renderLine(line, linesFrame)
          .catch(ErrorChain.thrower(`Error rendering line ${line.name}`))
      ));

      if (networkChanged) RoadRenderer.bringInfraToFront();
      this.lineSegmentRenderer.bringLinesFrameToFront();
      this.stationRenderer.bringStationsToFront();
    } finally {
      this.isRendering = false;
    }
  }
}
