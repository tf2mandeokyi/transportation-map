import stationFigml from "./station.figml";
import stationTextFigml from "./station-text.figml";
import stationContentFigml from "./station-content.figml";
import stationLineFigml from "./station-line.figml";
import stationLineDotFigml from "./station-line-dot.figml";
import stationLineTextFigml from "./station-line-text.figml";
import editHandleFigml from "./edit-handle.figml";
import radiusHandleFigml from "./radius-handle.figml";
import { RenderResult } from "@/figml-parser/result";

import { FigmlParser } from "@/figml-parser";
import { FigmlAlignment } from "@/figml-parser/types";
import { hexToRgb } from "@/common/utils/color";

const FIGML_IMPORTS = {
  'station.figml': stationFigml,
  'station-text.figml': stationTextFigml,
  'station-content.figml': stationContentFigml,
  'station-line.figml': stationLineFigml,
  'station-line-dot.figml': stationLineDotFigml,
  'station-line-text.figml': stationLineTextFigml,
  'edit-handle.figml': editHandleFigml,
  'radius-handle.figml': radiusHandleFigml,
} as const;

export function resolveImport(filename: string): string {
  const importContent = FIGML_IMPORTS[filename as keyof typeof FIGML_IMPORTS];
  if (!importContent) throw new Error(`Unknown import path: ${filename}`);
  return importContent;
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
  textRotation: number,
  textLocation: 'left' | 'right' | 'top' | 'bottom',
  align: FigmlAlignment,
  textHAlign: FigmlAlignment,
  textFrameAlign: FigmlAlignment,
  children: RenderResult[]
}
export function renderStation({ text, visible, rotation, textRotation, textLocation, align, textHAlign, textFrameAlign, children }: StationProps): RenderResult {
  return STATION_TEMPLATE.render({ text, visible, rotation, textRotation, align, textHAlign, textFrameAlign, children }, { textLocation });
}

const EDIT_HANDLE_TEMPLATE = FigmlParser.parseComponent(editHandleFigml);
export function renderEditHandle({ fill, size }: { fill: string; size: number }): RenderResult {
  return EDIT_HANDLE_TEMPLATE.render({ fill, size }, {});
}

const RADIUS_HANDLE_TEMPLATE = FigmlParser.parseComponent(radiusHandleFigml);
export function renderRadiusHandle({ diameter }: { diameter: number }): RenderResult {
  return RADIUS_HANDLE_TEMPLATE.render({ diameter }, {});
}