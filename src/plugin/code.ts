import { own } from "@/common/utils/ownership";
import { Controller } from "./controllers";
import { Model } from "./models";
import { View } from "./views";
import { NODE_DEFAULT_RADIUS } from "./views/road";

async function main() {
  figma.skipInvisibleInstanceChildren = true;
  figma.showUI(__html__, { visible: true, width: 400, height: 600 });
  console.log("Transportation Map Generator Initialized!");

  let model = await Model.load();

  if (model) {
    console.log("Loaded existing map data from document:", model);
  } else {
    console.log("No existing map data found, creating new model");
    model = new Model();
  }

  const view = new View();
  const controller = new Controller(model, view);

  await controller.initialize();
  figma.on('close', () => controller.cleanup());

  const hasExistingData = !model.state.getStations().next().done || !model.state.getLines().next().done;
  if (hasExistingData) {
    console.log("Existing map data found, rendering it");
    await controller.refresh();
  } else {
    console.log("Creating demo map");
    await createDemoMap(controller, model);
    await controller.refresh();
    figma.viewport.scrollAndZoomIntoView(figma.currentPage.children);
  }
}

async function createDemoMap(controller: Controller, model: Model) {
  const n1Pos = { x: 100, y: 300 };
  const n2Pos = { x: 400, y: 300 };
  const n3Pos = { x: 700, y: 300 };
  const n4Pos = { x: 400, y: 100 };

  // Create graph nodes (intersection points)
  const n1 = model.addNode({ name: 'West Junction',    position: n1Pos, radius: NODE_DEFAULT_RADIUS });
  const n2 = model.addNode({ name: 'Central Junction', position: n2Pos, radius: NODE_DEFAULT_RADIUS });
  const n3 = model.addNode({ name: 'East Junction',    position: n3Pos, radius: NODE_DEFAULT_RADIUS });
  const n4 = model.addNode({ name: 'North Junction',   position: n4Pos, radius: NODE_DEFAULT_RADIUS });

  // Create roads between nodes with absolute bezier positions; endpoints sit on each node's boundary circle
  const road1 = model.addRoad({
    name: 'West-Central',
    bezierMidPoint: { x: (n1Pos.x + n2Pos.x) / 2, y: (n1Pos.y + n2Pos.y) / 2 },
    endpoints: [
      own({ node: n1, horizontalOffset: 0, groupNumber: 0 }),
      own({ node: n2, horizontalOffset: 0, groupNumber: 0 }),
    ],
  });

  const road2 = model.addRoad({
    name: 'Central-East',
    bezierMidPoint: { x: (n2Pos.x + n3Pos.x) / 2, y: (n2Pos.y + n3Pos.y) / 2 },
    endpoints: [
      own({ node: n2, horizontalOffset: 0, groupNumber: 0 }),
      own({ node: n3, horizontalOffset: 0, groupNumber: 0 }),
    ],
  });

  const road3 = model.addRoad({
    name: 'Central-North',
    bezierMidPoint: { x: (n2Pos.x + n4Pos.x) / 2, y: (n2Pos.y + n4Pos.y) / 2 },
    endpoints: [
      own({ node: n2, horizontalOffset: 0, groupNumber: 0 }),
      own({ node: n4, horizontalOffset: 0, groupNumber: 0 }),
    ],
  });

  // Create road sections (parallel tracks)
  const sec1 = model.addRoadSection(road1, { name: 'Track A', index: 0 });
  const sec2 = model.addRoadSection(road2, { name: 'Track A', index: 0 });
  const sec3 = model.addRoadSection(road3, { name: 'Track A', index: 0 });

  // Create stations on sections
  const sWest   = model.addStation({ name: 'West Station',    textAlign: 'right',  textHAlign: 'left', textRotation: 0, flipped: false, interpT: 0.2,  roadSection: sec1 });
  const sCentral = model.addStation({ name: 'Central Station', textAlign: 'bottom', textHAlign: 'left', textRotation: 0, flipped: false, interpT: 0.5,  roadSection: sec1 });
  const sEast    = model.addStation({ name: 'East Station',   textAlign: 'right',  textHAlign: 'left', textRotation: 0, flipped: false, interpT: 0.8,  roadSection: sec2 });
  const sNorth   = model.addStation({ name: 'North Station',  textAlign: 'right',  textHAlign: 'left', textRotation: 0, flipped: false, interpT: 0.7,  roadSection: sec3 });
  const sMid     = model.addStation({ name: 'Midpoint',       textAlign: 'right',  textHAlign: 'left', textRotation: 0, flipped: false, interpT: 0.5,  roadSection: sec2 });

  // Create lines
  const redLine = model.addLine({ name: 'Red Line', color: '#ff0000', isCircular: false, paths: [] });
  const blueLine = model.addLine({ name: 'Blue Line', color: '#0000ff', isCircular: false, paths: [] });

  // Red line: West → Central → North
  controller.connectStationsWithLine(redLine.id, sWest, sCentral);
  controller.connectStationsWithLine(redLine.id, sCentral, sNorth);

  // Blue line: West → Central → Mid → East
  controller.connectStationsWithLine(blueLine.id, sWest, sCentral);
  controller.connectStationsWithLine(blueLine.id, sCentral, sMid);
  controller.connectStationsWithLine(blueLine.id, sMid, sEast);
}

main();
