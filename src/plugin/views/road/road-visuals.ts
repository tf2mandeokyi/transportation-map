import { MapState, Road } from "../../models/structures";
import { elevateToCubic, offsetBezierAdaptive, bezierListPathData, TRACK_SPACING, ROAD_MIN_WIDTH } from "../../utils/bezier";
import { getLinesForSection, sectionBandWidth } from "../../utils/section";
import { FIGMA_KEY_ROAD_ID } from "./constants";

const SECTION_COLOR: RGB = { r: 0.82, g: 0.82, b: 0.82 };
const DIVIDER_COLOR: RGB = { r: 0.65, g: 0.65, b: 0.65 };
const DIVIDER_WIDTH = 1.5;

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

  const center = (sections.length - 1) / 2;
  const left  = sections[0];
  const right = sections[sections.length - 1];
  const leftEdge  = (left.index  - center) * TRACK_SPACING - sectionBandWidth(getLinesForSection(left,  state).length) / 2;
  const rightEdge = (right.index - center) * TRACK_SPACING + sectionBandWidth(getLinesForSection(right, state).length) / 2;

  const roadNode = makeVectorCurve(
    bezierListPathData(offsetBezierAdaptive(baseCurve, (leftEdge + rightEdge) / 2)),
    SECTION_COLOR, rightEdge - leftEdge
  );
  roadNode.name = 'band';
  roadNode.setPluginData(FIGMA_KEY_ROAD_ID, road.id);

  const result: SceneNode[] = [roadNode];
  for (let i = 0; i < sections.length - 1; i++) {
    const divOffset = ((sections[i].index + sections[i + 1].index) / 2 - center) * TRACK_SPACING;
    const divNode   = makeVectorCurve(bezierListPathData(offsetBezierAdaptive(baseCurve, divOffset)), DIVIDER_COLOR, DIVIDER_WIDTH);
    divNode.name = `divider-${i}`;
    divNode.setPluginData(FIGMA_KEY_ROAD_ID, road.id);
    result.push(divNode);
  }
  return result;
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
