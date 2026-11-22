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

  width = 0;
  height = 0;
  showGrid = true;
  hover: Hover | null = null;

  async init(host: HTMLElement, world: World, camera: Camera) {
    this.world = world;
    this.camera = camera;
    await this.app.init({
      background: BG_COLOR,
      antialias: false,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 3),
      autoStart: false,
      sharedTicker: false,
      preference: 'webgl',
    });
    this.app.ticker.stop();
    host.appendChild(this.app.canvas);
    this.app.stage.addChild(this.layer, this.grid, this.cursor);

    for (const c of world.chunks.values()) this.addChunk(c);
    world.onChunkAdded = (c) => this.addChunk(c);
    world.onChunkRemoved = (c) => this.removeChunk(c);

    const resize = () => {
      this.width = host.clientWidth;
      this.height = host.clientHeight;
      this.app.renderer.resize(this.width, this.height);
      this.requestRender();
    };
    new ResizeObserver(resize).observe(host);
    resize();
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
    const res = this.app.renderer.resolution;
    this.layer.position.set(Math.round(cam.x * res) / res, Math.round(cam.y * res) / res);
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
    const cam = this.camera;
    const ox = this.layer.x, oy = this.layer.y, z = cam.zoom;
    const w = this.width, h = this.height;

    // Fine pixel grid, fading in with zoom.
    if (z >= GRID_MIN_ZOOM) {
      const alpha = Math.min(0.18, ((z - GRID_MIN_ZOOM) / 8) * 0.18 + 0.05);
      for (let x = Math.floor(x0); x <= x1; x++) {
        const sx = x * z + ox;
        g.moveTo(sx, 0).lineTo(sx, h);
      }
      for (let y = Math.floor(y0); y <= y1; y++) {
        const sy = y * z + oy;
        g.moveTo(0, sy).lineTo(w, sy);
      }
      g.stroke({ width: 1, color: 0x000000, alpha, pixelLine: true });
    }

    // Chunk boundaries every CHUNK pixels, when they are not too dense.
    if (CHUNK * z >= 24) {
      for (let x = Math.floor(x0 / CHUNK) * CHUNK; x <= x1; x += CHUNK) {
        const sx = x * z + ox;
        g.moveTo(sx, 0).lineTo(sx, h);
      }
      for (let y = Math.floor(y0 / CHUNK) * CHUNK; y <= y1; y += CHUNK) {
        const sy = y * z + oy;
        g.moveTo(0, sy).lineTo(w, sy);
      }
      g.stroke({ width: 1, color: 0x000000, alpha: 0.12, pixelLine: true });
    }

    // Origin axes.
    g.moveTo(ox, 0).lineTo(ox, h).moveTo(0, oy).lineTo(w, oy);
    g.stroke({ width: 1, color: 0x4060ff, alpha: 0.35, pixelLine: true });
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
