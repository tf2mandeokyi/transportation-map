import { Road } from "../../models/structures";
import { bezierListPathData, QuadBezierPoints } from "../../utils/bezier";
import { ROAD_MIN_WIDTH } from "../../utils/constants";
import { FIGMA_KEY_ROAD_ID, FIGMA_KEY_SECTION_ID } from "./constants";

const SECTION_COLOR: RGB = { r: 0.82, g: 0.82, b: 0.82 };

function makeVectorCurve(pathData: string, color: RGB, weight: number): VectorNode {
  const node = figma.createVector();
  node.vectorPaths = [{ windingRule: 'NONZERO', data: pathData }];
  node.fills = [];
  node.strokes = [{ type: 'SOLID', color }];
  node.strokeWeight = weight;
  node.strokeCap = 'NONE';
  return node;
}

export function buildRoadVisuals(road: Road): SceneNode[] {
  if (!road.endpoints[0]?.node || !road.endpoints[1]?.node) return [];

  const baseCurve = new QuadBezierPoints(
    road.computeEndpointPos(0),
    road.bezierMidPoint,
    road.computeEndpointPos(1),
  ).elevateToCubic();

  const sections = road.getSectionsByIndex();
  if (sections.length === 0) {
    const node = makeVectorCurve(bezierListPathData([baseCurve]), SECTION_COLOR, ROAD_MIN_WIDTH);
    node.name = 'centerline';
    node.setPluginData(FIGMA_KEY_ROAD_ID, road.id);
    return [node];
  }

  return sections.map(section => {
    const offset = section.computeOffset();
    const curve = offset === 0 ? [baseCurve] : baseCurve.offsetAdaptive(offset);
    const width = section.getWidth();
    const node = makeVectorCurve(bezierListPathData(curve), SECTION_COLOR, width);
    node.name = section.name ?? `section-${section.index}`;
    node.setPluginData(FIGMA_KEY_ROAD_ID, road.id);
    node.setPluginData(FIGMA_KEY_SECTION_ID, section.id);
    return node;
  });
}

export function renderRoad(road: Road): void {
  const nodes = buildRoadVisuals(road);
  for (const node of nodes) figma.currentPage.appendChild(node);
}
