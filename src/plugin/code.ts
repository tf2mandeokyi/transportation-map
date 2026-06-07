import { Controller } from "./controllers";
import { Model } from "./models";
import { View } from "./views";

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
  view.setModel(model);
  const controller = new Controller(model, view);

  await controller.initialize();
  figma.on('close', () => controller.cleanup());

  const hasExistingData = model.getState().stations.size > 0 || model.getState().lines.size > 0;
  if (hasExistingData) {
    console.log("Existing map data found, skipping initial render");
    controller.syncLinesToUI();
    controller.syncNetworkToUI();
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
  const n1 = model.addNode({ name: 'West Junction',    roadConnections: [] });
  const n2 = model.addNode({ name: 'Central Junction', roadConnections: [] });
  const n3 = model.addNode({ name: 'East Junction',    roadConnections: [] });
  const n4 = model.addNode({ name: 'North Junction',   roadConnections: [] });

  // Create roads between nodes with absolute endpoint and bezier positions
  const road1 = model.addRoad({
    name: 'West-Central',
    startNodeId: n1, endNodeId: n2,
    bezierMidPoint: { x: (n1Pos.x + n2Pos.x) / 2, y: (n1Pos.y + n2Pos.y) / 2 },
    endpoints: [
      { endpointPos: n1Pos, groupNumber: 0 },
      { endpointPos: n2Pos, groupNumber: 0 },
    ],
    sections: new Map()
  });

  const road2 = model.addRoad({
    name: 'Central-East',
    startNodeId: n2, endNodeId: n3,
    bezierMidPoint: { x: (n2Pos.x + n3Pos.x) / 2, y: (n2Pos.y + n3Pos.y) / 2 },
    endpoints: [
      { endpointPos: n2Pos, groupNumber: 0 },
      { endpointPos: n3Pos, groupNumber: 0 },
    ],
    sections: new Map()
  });

  const road3 = model.addRoad({
    name: 'Central-North',
    startNodeId: n2, endNodeId: n4,
    bezierMidPoint: { x: (n2Pos.x + n4Pos.x) / 2, y: (n2Pos.y + n4Pos.y) / 2 },
    endpoints: [
      { endpointPos: n2Pos, groupNumber: 0 },
      { endpointPos: n4Pos, groupNumber: 0 },
    ],
    sections: new Map()
  });

  // Create road sections (parallel tracks)
  const sec1 = model.addRoadSection(road1, { name: 'Track A', index: 0, stationIds: [] });
  const sec2 = model.addRoadSection(road2, { name: 'Track A', index: 0, stationIds: [] });
  const sec3 = model.addRoadSection(road3, { name: 'Track A', index: 0, stationIds: [] });

  // Create stations on sections
  const sWest   = model.addStation({ name: 'West Station',    textAlign: 'right',  textRotation: 0, interpT: 0.2,  roadSectionId: sec1 });
  const sCentral = model.addStation({ name: 'Central Station', textAlign: 'bottom', textRotation: 0, interpT: 0.5,  roadSectionId: sec1 });
  const sEast    = model.addStation({ name: 'East Station',   textAlign: 'right',  textRotation: 0, interpT: 0.8,  roadSectionId: sec2 });
  const sNorth   = model.addStation({ name: 'North Station',  textAlign: 'right',  textRotation: 0, interpT: 0.7,  roadSectionId: sec3 });
  const sMid     = model.addStation({ name: 'Midpoint',       textAlign: 'right',  textRotation: 0, interpT: 0.5,  roadSectionId: sec2 });

  // Create lines
  const redLine = model.addLine({ name: 'Red Line', color: '#ff0000', isCircular: false, paths: [] });
  const blueLine = model.addLine({ name: 'Blue Line', color: '#0000ff', isCircular: false, paths: [] });

  // Red line: West → Central → North
  controller.connectStationsWithLine(redLine, sWest, sCentral);
  controller.connectStationsWithLine(redLine, sCentral, sNorth);

  // Blue line: West → Central → Mid → East
  controller.connectStationsWithLine(blueLine, sWest, sCentral);
  controller.connectStationsWithLine(blueLine, sCentral, sMid);
  controller.connectStationsWithLine(blueLine, sMid, sEast);
}

main();
