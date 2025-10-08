import busStopFigml from "./bus-stop.figml";
import busStopLineFigml from "./bus-stop-line.figml";
import busStopTextFigml from "./bus-stop-text.figml";
import busStopContentFigml from "./bus-stop-content.figml";
import busLineDotFigml from "./bus-line-dot.figml";
import busLineTextFigml from "./bus-line-text.figml";

const FIGML_IMPORTS = {
  'bus-stop.figml': busStopFigml,
  'bus-stop-line.figml': busStopLineFigml,
  'bus-stop-text.figml': busStopTextFigml,
  'bus-stop-content.figml': busStopContentFigml,
  'bus-line-dot.figml': busLineDotFigml,
  'bus-line-text.figml': busLineTextFigml,
} as const;

export function figmlImportResolver(filename: string): string {
  const importContent = FIGML_IMPORTS[filename as keyof typeof FIGML_IMPORTS];
  if (!importContent) throw new Error(`Unknown import path: ${filename}`);
  return importContent;
}