import { Controller } from "./controller";
import { Model } from "./model";
import { View } from "./view";

async function main() {
  figma.showUI(__html__, { visible: true, width: 320, height: 480 });

  console.log("Bus Map Generator Initialized!");

  const model = new Model();
  const view = new View();
  view.setModel(model); // Link model to view for stacking calculations
  const controller = new Controller(model, view);

  await controller.initialize();

  // Create some demo content to show functionality
  await createDemoMap(controller, model, view);

  figma.viewport.scrollAndZoomIntoView(figma.currentPage.children);
}

async function createDemoMap(controller: Controller, model: Model, view: View) {
  // Create demo bus stops (positioned in a non-linear layout)
  const s1 = controller.createStation('Central Station', { x: 200, y: 200 });
  const s2 = controller.createStation('Park Ave', { x: 450, y: 350 });
  const sHidden = controller.createStation('Hidden Point', { x: 700, y: 280 }, true); // Hidden shaping point
  const s3 = controller.createStation('Mall', { x: 900, y: 450 });

  // Create demo bus lines
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

  // Connect lines to stops
  controller.connectStationsWithLine(redLine, s1, s2);
  controller.connectStationsWithLine(redLine, s2, sHidden, true, false); // Passes by hidden point
  controller.connectStationsWithLine(redLine, sHidden, s3, false, true); // Passes by hidden point
  controller.connectStationsWithLine(blueLine, s1, s3);

  // Set line to pass by Park Ave without stopping
  model.setLineStopsAtStation(blueLine, s2, false);
  model.addStationToLine(blueLine, s2, false);

  // Render the complete map
  await view.render(model.getState());
}

// Start the plugin
main();