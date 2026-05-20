export function hexToRgb(hex: string): RGB {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: Number.parseInt(result[1], 16) / 255,
    g: Number.parseInt(result[2], 16) / 255,
    b: Number.parseInt(result[3], 16) / 255
  } : { r: 1, g: 0, b: 0 };
}