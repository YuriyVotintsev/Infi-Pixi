import { Application, BufferImageSource, Container, Graphics, Sprite, Texture, TilingSprite } from 'pixi.js';
import type { Camera } from './camera';
import { CHUNK, type Chunk, type World } from './world';
import type { Selection } from './selection';

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
 * Transparency checker: cell size is a power of two in art pixels (0.5, 1, 2, 4…)
 * so it scales with the art. The smallest cell that is still at least
 * CHECKER_MIN_CSS on screen is used; levels switch instantly.
 */
const CHECKER_MIN_CSS = 8;
const CHECKER_MIN_CELL = 0.5;

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
  /** 2×2 texels, tiled and scaled up to draw the transparency checkerboard. */
  private checkerData = new Uint8Array(16);
  private checkerSource = new BufferImageSource({
    resource: this.checkerData,
    width: 2,
    height: 2,
    scaleMode: 'nearest',
    autoGenerateMipmaps: false,
  });
  private checkerTex = new Texture({ source: this.checkerSource });
  private checker = new TilingSprite({ texture: this.checkerTex });
  /** Grid line color and per-level opacity (1px, 16px, 64px), tuned to the checker. */
  private gridColor = 0x000000;
  private gridAlpha: [number, number, number] = [0.2, 0.38, 0.58];
  private cursor = new Graphics();
  /** Selection outline (screen space) and the floating pixels being moved (world space). */
  private selGfx = new Graphics();
  private floatSprite: Sprite | null = null;
  selection: Selection | null = null;
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
    this.app.stage.addChild(this.checker, this.layer, this.grid, this.selGfx, this.cursor);

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

  /** Set the two checkerboard colors (0xRRGGBB). */
  setChecker(a: number, b: number) {
    const d = this.checkerData;
    // Texels: (0,0)=a (1,0)=b / (0,1)=b (1,1)=a
    [a, b, b, a].forEach((c, i) => {
      d[i * 4] = (c >> 16) & 0xff;
      d[i * 4 + 1] = (c >> 8) & 0xff;
      d[i * 4 + 2] = c & 0xff;
      d[i * 4 + 3] = 0xff;
    });
    this.checkerSource.update();
    const lum = (c: number) => 0.299 * ((c >> 16) & 0xff) + 0.587 * ((c >> 8) & 0xff) + 0.114 * (c & 0xff);
    const l = (lum(a) + lum(b)) / 2;
    if (l < 110) {
      this.gridColor = 0xffffff;
      this.gridAlpha = [0.14, 0.3, 0.5];
    } else if (l < 200) {
      this.gridColor = 0x000000;
      this.gridAlpha = [0.22, 0.42, 0.65];
    } else {
      this.gridColor = 0x000000;
      this.gridAlpha = [0.2, 0.38, 0.58];
    }
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

    // Checkerboard: fixed on-screen cell size (whole device pixels), scrolls with the canvas.
    // Checkerboard anchored to art pixels: it moves and scales exactly with the art.
    const cells = Math.max(CHECKER_MIN_CELL, 2 ** Math.ceil(Math.log2(CHECKER_MIN_CSS / z) - 1e-9));
    this.checker.width = this.width;
    this.checker.height = this.height;
    this.checker.tileScale.set(cells * z);
    this.checker.tilePosition.set(this.layer.x, this.layer.y);

    // Cull chunks outside the viewport.
    const [x0, y0] = cam.toWorld(0, 0);
    const [x1, y1] = cam.toWorld(this.width, this.height);
    const cx0 = Math.floor(x0 / CHUNK), cx1 = Math.floor(x1 / CHUNK);
    const cy0 = Math.floor(y0 / CHUNK), cy1 = Math.floor(y1 / CHUNK);
    for (const [c, v] of this.views) {
      v.sprite.visible = c.cx >= cx0 && c.cx <= cx1 && c.cy >= cy0 && c.cy <= cy1;
    }

    this.drawGrid(x0, y0, x1, y1);
    this.drawSelection();
    this.drawCursor();
    this.app.render();
  }

  private drawGrid(x0: number, y0: number, x1: number, y1: number) {
    const g = this.grid;
    g.clear();
    if (!this.showGrid) return;
    const z = this.camera.zoom;
    const px = this.pxX;

    // Three levels, finest first. A line is drawn only by the coarsest level it
    // belongs to (and never on the origin axes), so overlapping lines don't stack.
    // `minGap` is the on-screen spacing (CSS px) below which a level is hidden.
    // `dev` is the line thickness in device pixels: 1px lines alone are almost
    // invisible on 3× screens, so coarser levels get ~⅔ and ~1 CSS px.
    const levels = [
      { step: 1, minGap: GRID_MIN_ZOOM, alpha: this.gridAlpha[0], dev: 1 },
      { step: 16, minGap: 10, alpha: this.gridAlpha[1], dev: Math.max(1, Math.round(px * 0.67)) },
      { step: CHUNK, minGap: 10, alpha: this.gridAlpha[2], dev: Math.max(2, Math.round(px)) },
    ];
    levels.forEach((lv, i) => {
      if (lv.step * z < lv.minGap) return;
      // Fade in over the first doubling of spacing so levels don't pop.
      const fade = Math.min(1, ((lv.step * z - lv.minGap) / lv.minGap) * 2 + 0.6);
      const coarser = levels.slice(i + 1).map((l) => l.step);
      this.gridLines(x0, y0, x1, y1, lv.step, lv.dev, (v) => v !== 0 && !coarser.some((c) => v % c === 0));
      g.fill({ color: this.gridColor, alpha: lv.alpha * fade });
    });

    // Origin axes.
    this.gridLines(x0, y0, x1, y1, 1, Math.max(2, Math.round(px)), (v) => v === 0);
    g.fill({ color: 0x4060ff, alpha: 0.6 });
  }

  /**
   * Add vertical + horizontal bars every `step` world pixels that pass `keep`,
   * `dev` device pixels thick, centred on the pixel boundary and snapped to the
   * device-pixel grid.
   */
  private gridLines(
    x0: number, y0: number, x1: number, y1: number,
    step: number, dev: number, keep: (v: number) => boolean,
  ) {
    const g = this.grid;
    const z = this.camera.zoom, ox = this.layer.x, oy = this.layer.y;
    const w = this.width, h = this.height;
    const px = this.pxX, py = this.pxY;
    const back = Math.floor(dev / 2);
    for (let x = Math.floor(x0 / step) * step; x <= x1; x += step) {
      if (!keep(x)) continue;
      const dx = Math.round((x * z + ox) * px) - back;
      g.rect(dx / px, 0, dev / px, h);
    }
    for (let y = Math.floor(y0 / step) * step; y <= y1; y += step) {
      if (!keep(y)) continue;
      const dy = Math.round((y * z + oy) * py) - back;
      g.rect(0, dy / py, w, dev / py);
    }
  }

  /** Rebuild the floating-layer sprite after the selection lifted/dropped pixels. */
  updateFloating() {
    this.floatSprite?.destroy({ texture: true, textureSource: true });
    this.floatSprite = null;
    const f = this.selection?.floating;
    if (f) {
      const source = new BufferImageSource({
        resource: new Uint8Array(f.data.buffer, f.data.byteOffset, f.data.byteLength),
        width: f.w,
        height: f.h,
        scaleMode: 'nearest',
        autoGenerateMipmaps: false,
      });
      this.floatSprite = new Sprite(new Texture({ source }));
      this.floatSprite.zIndex = 1; // above every chunk, even ones created later
      this.layer.sortableChildren = true;
      this.layer.addChild(this.floatSprite);
    }
    this.requestRender();
  }

  private drawSelection() {
    const g = this.selGfx;
    g.clear();
    const r = this.selection?.rect;
    if (this.floatSprite && r) this.floatSprite.position.set(r.x, r.y);
    if (!r) return;
    const z = this.camera.zoom;
    const px = this.pxX, py = this.pxY;
    // Snap the outline to device pixels, just outside the selected area.
    const x0 = Math.round((r.x * z + this.layer.x) * px) / px;
    const y0 = Math.round((r.y * z + this.layer.y) * py) / py;
    const x1 = Math.round(((r.x + r.w) * z + this.layer.x) * px) / px;
    const y1 = Math.round(((r.y + r.h) * z + this.layer.y) * py) / py;
    const t = Math.max(1, Math.round(px)) / px; // ~1 CSS px thick
    // White base…
    g.rect(x0 - t, y0 - t, x1 - x0 + 2 * t, t)
      .rect(x0 - t, y1, x1 - x0 + 2 * t, t)
      .rect(x0 - t, y0, t, y1 - y0)
      .rect(x1, y0, t, y1 - y0)
      .fill({ color: 0xffffff, alpha: 0.95 });
    // …with black dashes ("marching ants", static).
    const dash = 4;
    for (let x = x0 - t; x < x1 + t; x += dash * 2) {
      const w = Math.min(dash, x1 + t - x);
      g.rect(x, y0 - t, w, t).rect(x, y1, w, t);
    }
    for (let y = y0; y < y1; y += dash * 2) {
      const h = Math.min(dash, y1 - y);
      g.rect(x0 - t, y, t, h).rect(x1, y, t, h);
    }
    g.fill({ color: 0x000000, alpha: 0.9 });
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
