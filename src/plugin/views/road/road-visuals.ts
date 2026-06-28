import { Road } from "../../models/structures";
import { bezierListPathData, QuadBezierPoints } from "../../utils/bezier";
import { ROAD_MIN_WIDTH } from "../../utils/constants";
import { FIGMA_KEY_ROAD_ID } from "./constants";

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
    road.endpoints[0].endpointPos,
    road.bezierMidPoint,
    road.endpoints[1].endpointPos,
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
    return node;
  });
}

export function renderRoad(road: Road): void {
  const nodes = buildRoadVisuals(road);
  if (nodes.length === 0) return;

  const children: SceneNode[] = nodes.length > 1
    ? [Object.assign(figma.group(nodes, figma.currentPage), { name: 'sections' })]
    : nodes;

  const group = figma.group(children, figma.currentPage);
  group.name = `Road: ${road.name ?? road.id}`;
  group.setPluginData(FIGMA_KEY_ROAD_ID, road.id);
  figma.currentPage.insertChild(0, group);
}
