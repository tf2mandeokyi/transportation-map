import busStopFigml from "./bus-stop.figml";
import busStopLineFigml from "./bus-stop-line.figml";
import busStopTextFigml from "./bus-stop-text.figml";
import busStopContentFigml from "./bus-stop-content.figml";
import busLineDotFigml from "./bus-line-dot.figml";
import busLineTextFigml from "./bus-line-text.figml";
import { RenderResult } from "../figml-parser/result";
import { FigmlParser } from "../figml-parser";
import { FigmlAlignment } from "../figml-parser/types";

const FIGML_IMPORTS = {
  'bus-stop.figml': busStopFigml,
  'bus-stop-line.figml': busStopLineFigml,
  'bus-stop-text.figml': busStopTextFigml,
  'bus-stop-content.figml': busStopContentFigml,
  'bus-line-dot.figml': busLineDotFigml,
  'bus-line-text.figml': busLineTextFigml,
} as const;

export function resolveImport(filename: string): string {
  const importContent = FIGML_IMPORTS[filename as keyof typeof FIGML_IMPORTS];
  if (!importContent) throw new Error(`Unknown import path: ${filename}`);
  return importContent;
}

const BUS_STOP_LINE_TEMPLATE = FigmlParser.parseComponent(busStopLineFigml);
interface BusStopLineProps {
  text: string,
  color: RGB,
  visible: boolean,
  facing: 'left' | 'right'
}
export function renderBusStopLine({ text, color, visible, facing }: BusStopLineProps): RenderResult {
  return BUS_STOP_LINE_TEMPLATE.render({ text, color, visible }, { facing });
}

const BUS_STOP_TEMPLATE = FigmlParser.parseComponent(busStopFigml);
interface BusStopProps {
  text: string,
  visible: boolean,
  rotation: number,
  textLocation: 'left' | 'right' | 'top' | 'bottom',
  align: FigmlAlignment,
  children: SceneNode[]
}
export function renderBusStop({ text, visible, rotation, textLocation, align, children }: BusStopProps): RenderResult {
  return BUS_STOP_TEMPLATE.render({ text, visible, rotation, align, children }, { textLocation });
}