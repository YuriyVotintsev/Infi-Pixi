import { Application, BufferImageSource, Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { Camera } from './camera';
import { CHUNK, type Chunk, type World } from './world';

interface ChunkView {
  sprite: Sprite;
  source: BufferImageSource;
}

export interface Hover {
  x: number;
  y: number;
  size: number;
}

/** Below this zoom the per-pixel grid is hidden. */
const GRID_MIN_ZOOM = 8;
export const BG_COLOR = 0xcfd0d8;

/**
 * Renders the world on demand (no constant ticker) to save battery:
 * call `requestRender()` whenever something visible changes.
 */
export class Renderer {
  readonly app = new Application();
  private world!: World;
  private camera!: Camera;
  private layer = new Container();
  private grid = new Graphics();
  private cursor = new Graphics();
  private views = new Map<Chunk, ChunkView>();
  private queued = false;

  /** Viewport size in CSS pixels. */
  width = 0;
  height = 0;
  /**
   * Device pixels per CSS pixel, measured from the real backing-store size.
   * May differ slightly per axis on fractional-DPR screens.
   */
  pxX = 1;
  pxY = 1;
  showGrid = true;
  hover: Hover | null = null;

  async init(host: HTMLElement, world: World, camera: Camera) {
    this.world = world;
    this.camera = camera;
    await this.app.init({
      background: BG_COLOR,
      antialias: false,
      // We size the backing store in exact device pixels ourselves (see resize below),
      // so Pixi works at resolution 1 and the stage is scaled CSS→device.
      autoDensity: false,
      resolution: 1,
      autoStart: false,
      sharedTicker: false,
      preference: 'webgl',
    });
    this.app.ticker.stop();
    const canvas = this.app.canvas;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    host.appendChild(canvas);
    this.app.stage.addChild(this.layer, this.grid, this.cursor);

    for (const c of world.chunks.values()) this.addChunk(c);
    world.onChunkAdded = (c) => this.addChunk(c);
    world.onChunkRemoved = (c) => this.removeChunk(c);

    // On fractional-DPR screens (e.g. 2.625) cssWidth*dpr is not an integer. If the
    // canvas backing store is rounded, the browser rescales it on output and art
    // pixels blur. device-pixel-content-box gives the exact device size instead.
    const apply = (cssW: number, cssH: number, devW: number, devH: number) => {
      if (cssW <= 0 || cssH <= 0) return;
      this.width = cssW;
      this.height = cssH;
      this.pxX = devW / cssW;
      this.pxY = devH / cssH;
      this.app.renderer.resize(devW, devH);
      this.app.stage.scale.set(this.pxX, this.pxY);
      this.requestRender();
    };
    const ro = new ResizeObserver((entries) => {
      const e = entries[entries.length - 1];
      const { width: cw, height: ch } = e.contentRect;
      const dpr = window.devicePixelRatio || 1;
      const dev = e.devicePixelContentBoxSize?.[0];
      // Trust the exact size only if it is consistent with the DPR (emulators may lie).
      const ok = dev && Math.abs(dev.inlineSize - cw * dpr) <= 1 && Math.abs(dev.blockSize - ch * dpr) <= 1;
      if (ok) apply(cw, ch, dev.inlineSize, dev.blockSize);
      else apply(cw, ch, Math.round(cw * dpr), Math.round(ch * dpr));
    });
    try {
      ro.observe(canvas, { box: 'device-pixel-content-box' });
    } catch {
      ro.observe(canvas); // Safari: falls back to rounding (DPR there is integer anyway)
    }
    const r = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    apply(r.width, r.height, Math.round(r.width * dpr), Math.round(r.height * dpr));
  }

  get canvas(): HTMLCanvasElement {
    return this.app.canvas;
  }

  private addChunk(c: Chunk) {
    const source = new BufferImageSource({
      resource: c.data,
      width: CHUNK,
      height: CHUNK,
      scaleMode: 'nearest',
      autoGenerateMipmaps: false,
    });
    const sprite = new Sprite(new Texture({ source }));
    sprite.position.set(c.cx * CHUNK, c.cy * CHUNK);
    this.layer.addChild(sprite);
    this.views.set(c, { sprite, source });
    this.requestRender();
  }

  private removeChunk(c: Chunk) {
    const v = this.views.get(c);
    if (!v) return;
    this.views.delete(c);
    v.sprite.destroy({ texture: true, textureSource: true });
    this.requestRender();
  }

  requestRender() {
    if (this.queued) return;
    this.queued = true;
    requestAnimationFrame(() => {
      this.queued = false;
      this.render();
    });
  }

  private render() {
    const cam = this.camera;
    const z = cam.zoom;

    for (const c of this.world.renderDirty) this.views.get(c)?.source.update();
    this.world.renderDirty.clear();

    // Snap the offset to the device-pixel grid so pixel edges stay crisp.
    this.layer.position.set(Math.round(cam.x * this.pxX) / this.pxX, Math.round(cam.y * this.pxY) / this.pxY);
    this.layer.scale.set(z);

    // Cull chunks outside the viewport.
    const [x0, y0] = cam.toWorld(0, 0);
    const [x1, y1] = cam.toWorld(this.width, this.height);
    const cx0 = Math.floor(x0 / CHUNK), cx1 = Math.floor(x1 / CHUNK);
    const cy0 = Math.floor(y0 / CHUNK), cy1 = Math.floor(y1 / CHUNK);
    for (const [c, v] of this.views) {
      v.sprite.visible = c.cx >= cx0 && c.cx <= cx1 && c.cy >= cy0 && c.cy <= cy1;
    }

    this.drawGrid(x0, y0, x1, y1);
    this.drawCursor();
    this.app.render();
  }

  private drawGrid(x0: number, y0: number, x1: number, y1: number) {
    const g = this.grid;
    g.clear();
    if (!this.showGrid) return;
    const z = this.camera.zoom;

    // Three levels, finest first. A line is drawn only by the coarsest level it
    // belongs to (and never on the origin axes), so overlapping lines don't stack.
    // `minGap` is the on-screen spacing (CSS px) below which a level is hidden.
    const levels = [
      { step: 1, minGap: GRID_MIN_ZOOM, alpha: 0.08 },
      { step: 16, minGap: 10, alpha: 0.2 },
      { step: CHUNK, minGap: 10, alpha: 0.45 },
    ];
    levels.forEach((lv, i) => {
      if (lv.step * z < lv.minGap) return;
      // Fade in over the first doubling of spacing so levels don't pop.
      const fade = Math.min(1, (lv.step * z - lv.minGap) / lv.minGap + 0.35);
      const coarser = levels.slice(i + 1).map((l) => l.step);
      this.gridLines(x0, y0, x1, y1, lv.step, (v) => v !== 0 && !coarser.some((c) => v % c === 0));
      g.stroke({ width: 1, color: 0x000000, alpha: lv.alpha * fade, pixelLine: true });
    });

    // Origin axes.
    const ox = this.layer.x, oy = this.layer.y;
    g.moveTo(ox, 0).lineTo(ox, this.height).moveTo(0, oy).lineTo(this.width, oy);
    g.stroke({ width: 1, color: 0x4060ff, alpha: 0.5, pixelLine: true });
  }

  /** Add vertical + horizontal lines every `step` world pixels that pass `keep`. */
  private gridLines(
    x0: number, y0: number, x1: number, y1: number,
    step: number, keep: (v: number) => boolean,
  ) {
    const g = this.grid;
    const z = this.camera.zoom, ox = this.layer.x, oy = this.layer.y;
    const w = this.width, h = this.height;
    for (let x = Math.floor(x0 / step) * step; x <= x1; x += step) {
      if (!keep(x)) continue;
      const sx = x * z + ox;
      g.moveTo(sx, 0).lineTo(sx, h);
    }
    for (let y = Math.floor(y0 / step) * step; y <= y1; y += step) {
      if (!keep(y)) continue;
      const sy = y * z + oy;
      g.moveTo(0, sy).lineTo(w, sy);
    }
  }

  private drawCursor() {
    const g = this.cursor;
    g.clear();
    const hv = this.hover;
    if (!hv) return;
    const z = this.camera.zoom;
    const half = Math.floor((hv.size - 1) / 2);
    const sx = (hv.x - half) * z + this.layer.x;
    const sy = (hv.y - half) * z + this.layer.y;
    const s = hv.size * z;
    g.rect(sx - 1, sy - 1, s + 2, s + 2).stroke({ width: 1, color: 0xffffff, alpha: 0.9, pixelLine: true });
    g.rect(sx, sy, s, s).stroke({ width: 1, color: 0x000000, alpha: 0.9, pixelLine: true });
  }
}
