/**
 * Pixels are stored as RGBA bytes; read through a Uint32Array view on a
 * little-endian machine (all target devices) that is 0xAABBGGRR.
 * UI colors are 0xRRGGBB numbers.
 */
export const EMPTY = 0;

export function rgbToPixel(rgb: number): number {
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = rgb & 0xff;
  return ((0xff << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

export function pixelToRgb(px: number): number {
  const r = px & 0xff;
  const g = (px >> 8) & 0xff;
  const b = (px >> 16) & 0xff;
  return (r << 16) | (g << 8) | b;
}

export function rgbToHex(rgb: number): string {
  return '#' + rgb.toString(16).padStart(6, '0');
}

export function hexToRgb(hex: string): number {
  return parseInt(hex.replace('#', ''), 16) & 0xffffff;
}
