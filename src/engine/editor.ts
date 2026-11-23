import { Camera } from './camera';
import { EMPTY, pixelToRgb } from './color';
import { History } from './history';
import { Renderer } from './renderer';
import { Storage } from './storage';
import { persisted, store } from './store';
import { CHUNK, World } from './world';
import { findPalette } from './palettes';

export type Tool = 'pen' | 'eraser' | 'picker';

/**
 * Owns the engine pieces and exposes observable state + actions for the UI.
 * Framework-agnostic: the UI talks to it only through stores and methods.
 */
export class Editor {
  readonly world = new World();
  readonly camera = new Camera();
  readonly history = new History(this.world);
  readonly renderer = new Renderer();
  readonly storage = new Storage(this.world);

  // UI-facing state
  readonly tool = persisted<Tool>('tool', 'pen');
  readonly color = persisted<number>('color', 0x000000);
  readonly brushSize = persisted<number>('brushSize', 1);
  /** Selected palette preset. */
  readonly paletteId = persisted<string>('paletteId', 'infi');
  /** User edits (added/removed colors) per preset id; absent = preset as shipped. */
  readonly paletteEdits = persisted<Record<string, number[]>>('paletteEdits', migrateOldPalette());
  /** Colors currently shown in the palette panel. */
  readonly palette = store<number[]>([]);
  readonly fingerDraw = persisted<boolean>('fingerDraw', false);
  readonly showGrid = persisted<boolean>('showGrid', true);
  readonly zoom = store(this.camera.zoom);
  readonly canUndo = store(false);
  readonly canRedo = store(false);
  /** Last input device seen; lets the UI adapt hints. */
  readonly lastPointer = store<'pen' | 'touch' | 'mouse'>('touch');

  private syncPalette = () => {
    const id = this.paletteId.get();
    this.palette.set(this.paletteEdits.get()[id] ?? findPalette(id).colors);
  };

  async init(host: HTMLElement) {
    this.paletteId.subscribe(this.syncPalette);
    this.paletteEdits.subscribe(this.syncPalette);

    await this.storage.load();
    this.restoreCamera();
    await this.renderer.init(host, this.world, this.camera);

    this.camera.onChange = () => {
      this.zoom.set(this.camera.zoom);
      this.renderer.requestRender();
      this.saveCameraSoon();
    };
    this.history.onChange = () => {
      this.canUndo.set(this.history.canUndo);
      this.canRedo.set(this.history.canRedo);
      this.changed();
    };
    this.showGrid.subscribe((v) => {
      this.renderer.showGrid = v;
      this.renderer.requestRender();
    });
    this.brushSize.subscribe((size) => {
      if (this.renderer.hover) {
        this.renderer.hover = { ...this.renderer.hover, size };
        this.renderer.requestRender();
      }
    });

    if (!this.hasSavedCamera) this.resetView();
  }

  /** Call after pixels changed outside of history bookkeeping. */
  changed() {
    this.renderer.requestRender();
    this.storage.scheduleSave();
  }

  pickAt(x: number, y: number): boolean {
    const px = this.world.getPixel(x, y);
    if (px === EMPTY) return false;
    this.color.set(pixelToRgb(px));
    return true;
  }

  undo() {
    this.history.undo();
  }

  redo() {
    this.history.redo();
  }

  /** Center on the drawing (or origin) at a comfortable zoom. */
  resetView() {
    const b = this.world.bounds();
    const r = this.renderer;
    if (!b) {
      this.camera.centerOn(0, 0, 12, r.width, r.height);
      return;
    }
    const fit = Math.min((r.width * 0.8) / b.w, (r.height * 0.7) / b.h);
    const zoom = Math.max(1, Math.min(32, Math.floor(fit)));
    this.camera.centerOn(b.x + b.w / 2, b.y + b.h / 2, zoom, r.width, r.height);
  }

  /** Set an absolute zoom level, keeping the screen center fixed. */
  zoomTo(z: number) {
    this.zoomBy(z / this.camera.zoom);
  }

  /** Center the world origin without changing zoom. */
  goToOrigin() {
    const r = this.renderer;
    this.camera.centerOn(0, 0, this.camera.zoom, r.width, r.height);
  }

  zoomBy(factor: number) {
    this.camera.zoomAt(this.renderer.width / 2, this.renderer.height / 2, factor);
  }

  async clearAll() {
    this.history.reset();
    this.world.clear();
    this.world.saveDirty.clear();
    await this.storage.wipe();
    this.renderer.requestRender();
  }

  private editPalette(colors: number[]) {
    this.paletteEdits.update((e) => ({ ...e, [this.paletteId.get()]: colors }));
  }

  addColor(rgb: number) {
    const p = this.palette.get();
    if (!p.includes(rgb)) this.editPalette([...p, rgb]);
    this.color.set(rgb);
  }

  removeColor(rgb: number) {
    this.editPalette(this.palette.get().filter((c) => c !== rgb));
  }

  /** Has the current palette been changed from its preset? */
  isPaletteEdited(): boolean {
    return this.paletteId.get() in this.paletteEdits.get();
  }

  resetPalette() {
    const { [this.paletteId.get()]: _, ...rest } = this.paletteEdits.get();
    this.paletteEdits.set(rest);
  }

  /** Export the drawing's bounding box as PNG, scaled by an integer factor. */
  async exportPNG(scale: number): Promise<Blob | null> {
    const b = this.world.bounds();
    if (!b) return null;
    const MAX = 8192;
    scale = Math.max(1, Math.min(scale, Math.floor(MAX / Math.max(b.w, b.h))));
    const src = document.createElement('canvas');
    src.width = b.w;
    src.height = b.h;
    const ctx = src.getContext('2d')!;
    const img = ctx.createImageData(b.w, b.h);
    const out = new Uint32Array(img.data.buffer);
    for (let y = 0; y < b.h; y++)
      for (let x = 0; x < b.w; x++) out[y * b.w + x] = this.world.getPixel(b.x + x, b.y + y);
    ctx.putImageData(img, 0, 0);

    let canvas = src;
    if (scale > 1) {
      canvas = document.createElement('canvas');
      canvas.width = b.w * scale;
      canvas.height = b.h * scale;
      const c2 = canvas.getContext('2d')!;
      c2.imageSmoothingEnabled = false;
      c2.drawImage(src, 0, 0, canvas.width, canvas.height);
    }
    return new Promise((res) => canvas.toBlob((blob) => res(blob), 'image/png'));
  }

  // ---- camera persistence ----

  private hasSavedCamera = false;
  private camTimer: ReturnType<typeof setTimeout> | null = null;

  private restoreCamera() {
    try {
      const raw = localStorage.getItem('infi-pixi:camera');
      if (!raw) return;
      const c = JSON.parse(raw);
      if ([c.x, c.y, c.zoom].every(Number.isFinite)) {
        Object.assign(this.camera, { x: c.x, y: c.y, zoom: c.zoom });
        this.zoom.set(c.zoom);
        this.hasSavedCamera = true;
      }
    } catch {
      /* ignore */
    }
  }

  private saveCameraSoon() {
    if (this.camTimer) clearTimeout(this.camTimer);
    this.camTimer = setTimeout(() => {
      const { x, y, zoom } = this.camera;
      try {
        localStorage.setItem('infi-pixi:camera', JSON.stringify({ x, y, zoom }));
      } catch {
        /* ignore */
      }
    }, 300);
  }
}

export { CHUNK };

/** Earlier builds stored a single editable palette under 'palette'. */
function migrateOldPalette(): Record<string, number[]> {
  try {
    const raw = localStorage.getItem('infi-pixi:palette');
    if (!raw) return {};
    localStorage.removeItem('infi-pixi:palette');
    const old = JSON.parse(raw);
    const base = findPalette('infi').colors;
    const same = Array.isArray(old) && old.length === base.length && old.every((c, i) => c === base[i]);
    return Array.isArray(old) && !same ? { infi: old } : {};
  } catch {
    return {};
  }
}
