type RGB = { r: number; g: number; b: number };

export function hexToRgb(hex: string): RGB {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: Number.parseInt(result[1], 16) / 255,
    g: Number.parseInt(result[2], 16) / 255,
    b: Number.parseInt(result[3], 16) / 255
  } : { r: 1, g: 0, b: 0 };
}

// Accepts either #RRGGBB (opaque) or #RRGGBBAA (alpha as the trailing byte).
export function hexToRgba(hex: string): { color: RGB; opacity: number } {
  const withAlpha = /^#?([a-f\d]{6})([a-f\d]{2})$/i.exec(hex);
  if (withAlpha) {
    return { color: hexToRgb(withAlpha[1]), opacity: Number.parseInt(withAlpha[2], 16) / 255 };
  }
  return { color: hexToRgb(hex), opacity: 1 };
}