import stationFigml from "./station.figml";
import stationTextFigml from "./station-text.figml";
import stationContentFigml from "./station-content.figml";
import stationLineFigml from "./station-line.figml";
import stationLineDotFigml from "./station-line-dot.figml";
import stationLineTextFigml from "./station-line-text.figml";
import { RenderResult } from "../figml-parser/result";
import { FigmlParser } from "../figml-parser";
import { FigmlAlignment } from "../figml-parser/types";

const FIGML_IMPORTS = {
  'station.figml': stationFigml,
  'station-text.figml': stationTextFigml,
  'station-content.figml': stationContentFigml,
  'station-line.figml': stationLineFigml,
  'station-line-dot.figml': stationLineDotFigml,
  'station-line-text.figml': stationLineTextFigml,
} as const;

export function resolveImport(filename: string): string {
  const importContent = FIGML_IMPORTS[filename as keyof typeof FIGML_IMPORTS];
  if (!importContent) throw new Error(`Unknown import path: ${filename}`);
  return importContent;
}

function hexToRgb(hex: string): RGB {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16) / 255,
    g: parseInt(result[2], 16) / 255,
    b: parseInt(result[3], 16) / 255
  } : { r: 1, g: 0, b: 0 };
}

const STATION_LINE_TEMPLATE = FigmlParser.parseComponent(stationLineFigml);
interface StationLineProps {
  text: string,
  color: string, // hex color
  stops: boolean,
  visible: boolean,
  facing: 'left' | 'right'
}
export function renderStationLine({ text, color, stops, visible, facing }: StationLineProps): RenderResult {
  return STATION_LINE_TEMPLATE.render({ text, color: hexToRgb(color), stops, visible }, { facing });
}

const STATION_TEMPLATE = FigmlParser.parseComponent(stationFigml);
interface StationProps {
  text: string,
  visible: boolean,
  rotation: number,
  textLocation: 'left' | 'right' | 'top' | 'bottom',
  align: FigmlAlignment,
  children: SceneNode[]
}
export function renderStation({ text, visible, rotation, textLocation, align, children }: StationProps): RenderResult {
  return STATION_TEMPLATE.render({ text, visible, rotation, align, children }, { textLocation });
}