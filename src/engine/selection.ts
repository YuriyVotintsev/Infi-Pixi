import { EMPTY } from './color';
import type { History } from './history';
import { store } from './store';
import type { World } from './world';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Bitmap {
  w: number;
  h: number;
  /** Row-major pixels in world format (see color.ts). */
  data: Uint32Array;
}

/**
 * Rectangular selection with a "floating" layer for moving pixels around.
 *
 * Moving lifts the pixels: the source area is cleared inside an open history
 * stroke, the pixels ride along in `floating`, and `drop()` stamps them at the
 * new place and commits — so the whole move is one undo step.
 */
export class Selection {
  rect: Rect | null = null;
  floating: Bitmap | null = null;
  clipboard: Bitmap | null = null;

  /** UI-facing summary. */
  readonly state = store({ active: false, floating: false, hasClipboard: false });

  /** Called whenever anything visible changed. */
  onChange: () => void = () => {};
  /** Called when the floating bitmap itself was replaced (not just moved). */
  onFloatingChanged: () => void = () => {};

  private anchor: { x: number; y: number } | null = null;
  private grab: { x: number; y: number; rx: number; ry: number } | null = null;

  constructor(
    private world: World,
    private history: History,
  ) {}

  contains(x: number, y: number): boolean {
    const r = this.rect;
    return !!r && x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
  }

  // ---------- marquee ----------

  beginMarquee(x: number, y: number) {
    this.drop();
    this.anchor = { x, y };
    this.rect = { x, y, w: 1, h: 1 };
    this.changed();
  }

  updateMarquee(x: number, y: number) {
    const a = this.anchor;
    if (!a) return;
    this.rect = {
      x: Math.min(a.x, x),
      y: Math.min(a.y, y),
      w: Math.abs(x - a.x) + 1,
      h: Math.abs(y - a.y) + 1,
    };
    this.changed();
  }

  endMarquee() {
    this.anchor = null;
  }

  // ---------- moving ----------

  beginMove(x: number, y: number) {
    const r = this.rect!;
    this.grab = { x, y, rx: r.x, ry: r.y };
  }

  /** Returns true if the selection actually moved. */
  updateMove(x: number, y: number): boolean {
    const g = this.grab, r = this.rect;
    if (!g || !r) return false;
    const nx = g.rx + (x - g.x), ny = g.ry + (y - g.y);
    if (nx === r.x && ny === r.y) return false;
    if (!this.floating) this.lift();
    r.x = nx;
    r.y = ny;
    this.changed();
    return true;
  }

  endMove(cancel = false) {
    const g = this.grab;
    this.grab = null;
    if (cancel && g && this.rect) {
      this.rect.x = g.rx;
      this.rect.y = g.ry;
      this.changed();
    }
  }

  nudge(dx: number, dy: number) {
    if (!this.rect) return;
    if (!this.floating) this.lift();
    this.rect.x += dx;
    this.rect.y += dy;
    this.changed();
  }

  // ---------- floating layer ----------

  private read(r: Rect): Bitmap {
    const data = new Uint32Array(r.w * r.h);
    for (let j = 0; j < r.h; j++)
      for (let i = 0; i < r.w; i++) data[j * r.w + i] = this.world.getPixel(r.x + i, r.y + j);
    return { w: r.w, h: r.h, data };
  }

  /** Cut the selected pixels out of the world into the floating layer. */
  private lift() {
    const r = this.rect!;
    this.floating = this.read(r);
    this.history.begin();
    for (let j = 0; j < r.h; j++) for (let i = 0; i < r.w; i++) this.history.set(r.x + i, r.y + j, EMPTY);
    this.onFloatingChanged();
  }

  /** Stamp the floating layer into the world (opaque pixels only) and commit. */
  drop() {
    const f = this.floating, r = this.rect;
    if (!f || !r) return;
    for (let j = 0; j < f.h; j++)
      for (let i = 0; i < f.w; i++) {
        const v = f.data[j * f.w + i];
        if (v !== EMPTY) this.history.set(r.x + i, r.y + j, v);
      }
    this.history.commit();
    this.floating = null;
    this.onFloatingChanged();
    this.changed();
  }

  // ---------- clipboard actions ----------

  private snapshot(): Bitmap | null {
    if (this.floating) return { ...this.floating, data: this.floating.data.slice() };
    return this.rect ? this.read(this.rect) : null;
  }

  copy() {
    const b = this.snapshot();
    if (b) this.clipboard = b;
    this.changed();
  }

  cut() {
    const b = this.snapshot();
    if (!b) return;
    this.clipboard = b;
    this.erase();
  }

  /** Delete the selected pixels (or the floating layer). */
  erase() {
    const r = this.rect;
    if (!r) return;
    if (this.floating) {
      // Source is already cleared inside the open stroke; just discard the layer.
      this.floating = null;
      this.history.commit();
      this.onFloatingChanged();
    } else {
      this.history.begin();
      for (let j = 0; j < r.h; j++) for (let i = 0; i < r.w; i++) this.history.set(r.x + i, r.y + j, EMPTY);
      this.history.commit();
    }
    this.changed();
  }

  /** Paste the clipboard as a floating layer; top-left at (x, y). */
  paste(x: number, y: number) {
    const c = this.clipboard;
    if (!c) return;
    this.drop();
    this.history.begin();
    this.floating = { ...c, data: c.data.slice() };
    this.rect = { x, y, w: c.w, h: c.h };
    this.onFloatingChanged();
    this.changed();
  }

  /** Commit any floating pixels and remove the selection. */
  clear() {
    this.drop();
    this.anchor = null;
    this.grab = null;
    if (this.rect) {
      this.rect = null;
      this.changed();
    }
  }

  private changed() {
    this.state.set({
      active: !!this.rect,
      floating: !!this.floating,
      hasClipboard: !!this.clipboard,
    });
    this.onChange();
  }
}
