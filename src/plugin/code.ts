import { Controller } from "./controllers";
import { Model } from "./model";
import { View } from "./view";

async function main() {
  figma.showUI(__html__, { visible: true, width: 400, height: 480 });

  console.log("Transportation Map Generator Initialized!");

  // Try to load existing map data from document
  let model = await Model.load();

  if (model) {
    console.log("Loaded existing map data from document: ", model);
  } else {
    console.log("No existing map data found, creating new model");
    model = new Model();
  }

  const view = new View();
  view.setModel(model); // Link model to view for stacking calculations
  const controller = new Controller(model, view);

  await controller.initialize();

  // Only create demo map if this is a fresh model with no data
  const hasExistingData = model.getState().stations.size > 0 || model.getState().lines.size > 0;
  if (!hasExistingData) {
    console.log("Creating demo map");
    await createDemoMap(controller, model);
  }
  controller.refresh();

  figma.viewport.scrollAndZoomIntoView(figma.currentPage.children);
}

async function createDemoMap(controller: Controller, model: Model) {
  // Create demo stations with different orientations
  const s1 = controller.createStation('Central Station', { x: 200, y: 200 }, false, 'RIGHT'); // Facing right
  const s2 = controller.createStation('Park Ave', { x: 450, y: 350 }, false, 'RIGHT'); // Facing right
  const sHidden = controller.createStation('Hidden Point', { x: 700, y: 280 }, true, 'RIGHT'); // Hidden shaping point
  const s3 = controller.createStation('Mall', { x: 900, y: 450 }, false, 'RIGHT'); // Facing right

  // Add stations with different orientations for testing
  const s4 = controller.createStation('North Station', { x: 200, y: 600 }, false, 'UP'); // Facing up
  const s5 = controller.createStation('South Station', { x: 450, y: 600 }, false, 'DOWN'); // Facing down
  const s6 = controller.createStation('West Station', { x: 700, y: 600 }, false, 'LEFT'); // Facing left

  // Create demo lines
  const redLine = model.addLine({
    name: 'Red Line',
    color: { r: 1, g: 0, b: 0 },
    path: []
  });

  const blueLine = model.addLine({
    name: 'Blue Line',
    color: { r: 0, g: 0, b: 1 },
    path: []
  });

  const greenLine = model.addLine({
    name: 'Green Line',
    color: { r: 0, g: 0.8, b: 0 },
    path: []
  });

  // Connect lines to stations
  controller.connectStationsWithLine(redLine, s1, s2);
  controller.connectStationsWithLine(redLine, s2, sHidden, true, false); // Passes by hidden point
  controller.connectStationsWithLine(redLine, sHidden, s3, false, true); // Passes by hidden point
  controller.connectStationsWithLine(blueLine, s1, s3);

  // Connect green line through different orientations
  controller.connectStationsWithLine(greenLine, s4, s5);
  controller.connectStationsWithLine(greenLine, s5, s6);
  controller.connectStationsWithLine(greenLine, s6, s3);

  // Set line to pass by Park Ave without stopping
  model.setLineStopsAtStation(blueLine, s2, false);
  model.addStationToLine(blueLine, s2, false);
}

// Start the plugin
main();