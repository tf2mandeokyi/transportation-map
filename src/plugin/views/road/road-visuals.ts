import { MapState, Road } from "../../models/structures";
import { elevateToCubic, offsetBezierAdaptive, bezierListPathData } from "../../utils/bezier";
import { ROAD_MIN_WIDTH } from "../../utils/constants";
import { getLinesForSection } from "../../utils/section";
import { sectionBandWidth, computeSectionOffset } from "../../utils/line-queries";
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

export function buildRoadVisuals(road: Road, state: Readonly<MapState>): SceneNode[] {
  if (!state.nodes.get(road.startNodeId) || !state.nodes.get(road.endNodeId)) return [];

  const baseCurve = elevateToCubic({
    p0: road.endpoints[0].endpointPos,
    p1: road.bezierMidPoint,
    p2: road.endpoints[1].endpointPos,
  });

  const sections = Array.from(road.sections.values()).sort((a, b) => a.index - b.index);
  if (sections.length === 0) {
    const node = makeVectorCurve(bezierListPathData([baseCurve]), SECTION_COLOR, ROAD_MIN_WIDTH);
    node.name = 'centerline';
    node.setPluginData(FIGMA_KEY_ROAD_ID, road.id);
    return [node];
  }

  return sections.map(section => {
    const offset = computeSectionOffset(section, road, state);
    const curve = offset === 0 ? [baseCurve] : offsetBezierAdaptive(baseCurve, offset);
    const width = sectionBandWidth(getLinesForSection(section, state).length);
    const node = makeVectorCurve(bezierListPathData(curve), SECTION_COLOR, width);
    node.name = section.name ?? `section-${section.index}`;
    node.setPluginData(FIGMA_KEY_ROAD_ID, road.id);
    return node;
  });
}

export function renderRoad(road: Road, state: Readonly<MapState>): void {
  const nodes = buildRoadVisuals(road, state);
  if (nodes.length === 0) return;

  const children: SceneNode[] = nodes.length > 1
    ? [Object.assign(figma.group(nodes, figma.currentPage), { name: 'sections' })]
    : nodes;

  const group = figma.group(children, figma.currentPage);
  group.name = `Road: ${road.name ?? road.id}`;
  group.setPluginData(FIGMA_KEY_ROAD_ID, road.id);
  figma.currentPage.insertChild(0, group);
}
