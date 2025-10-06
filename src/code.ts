import { Controller } from "./controller";
import { Model } from "./model";
import { LineId, NodeId } from "./structures";
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
  // Create demo bus stops
  controller.createNode('Central Station' as NodeId, { x: 200, y: 200 });
  controller.createNode('Park Ave' as NodeId, { x: 400, y: 200 });
  controller.createNode('Hidden Point' as NodeId, { x: 600, y: 200 }, true); // Hidden shaping point
  controller.createNode('Mall' as NodeId, { x: 800, y: 200 });

  // Create demo bus lines
  model.addLine({
    id: 'Red Line' as LineId,
    name: 'Red Line',
    color: '#ff0000',
    path: []
  });

  model.addLine({
    id: 'Blue Line' as LineId,
    name: 'Blue Line',
    color: '#0000ff',
    path: []
  });

  // Connect lines to stops
  await controller.connectNodesWithLine('Red Line' as LineId, 'Central Station' as NodeId, 'Park Ave' as NodeId);
  await controller.connectNodesWithLine('Red Line' as LineId, 'Park Ave' as NodeId, 'Hidden Point' as NodeId, true, false); // Passes by hidden point
  await controller.connectNodesWithLine('Red Line' as LineId, 'Hidden Point' as NodeId, 'Mall' as NodeId, false, true); // Passes by hidden point

  await controller.connectNodesWithLine('Blue Line' as LineId, 'Central Station' as NodeId, 'Mall' as NodeId);

  // Set line to pass by Park Ave without stopping
  model.setLineStopsAtNode('Blue Line' as LineId, 'Park Ave' as NodeId, false);
  model.addNodeToLine('Blue Line' as LineId, 'Park Ave' as NodeId, false);

  // Render the complete map
  await view.render(model.getState());
}

// Start the plugin
main();