export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 128;

/**
 * screen = world * zoom + offset  (CSS pixels)
 */
export class Camera {
  x = 0;
  y = 0;
  zoom = 12;

  onChange: () => void = () => {};

  toWorld(sx: number, sy: number): [number, number] {
    return [(sx - this.x) / this.zoom, (sy - this.y) / this.zoom];
  }

  toScreen(wx: number, wy: number): [number, number] {
    return [wx * this.zoom + this.x, wy * this.zoom + this.y];
  }

  pan(dx: number, dy: number) {
    if (!dx && !dy) return;
    this.x += dx;
    this.y += dy;
    this.onChange();
  }

  /** Zoom by `factor`, keeping the world point under (sx, sy) fixed. */
  zoomAt(sx: number, sy: number, factor: number) {
    const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom * factor));
    if (z === this.zoom) return;
    const [wx, wy] = this.toWorld(sx, sy);
    this.zoom = z;
    this.x = sx - wx * z;
    this.y = sy - wy * z;
    this.onChange();
  }

  /** Center world point (wx, wy) on a viewport of the given size. */
  centerOn(wx: number, wy: number, zoom: number, vw: number, vh: number) {
    this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
    this.x = vw / 2 - wx * this.zoom;
    this.y = vh / 2 - wy * this.zoom;
    this.onChange();
  }
}
