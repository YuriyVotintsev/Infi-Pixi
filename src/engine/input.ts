import { EMPTY, rgbToPixel } from './color';
import type { Editor, Tool } from './editor';

/**
 * Input model:
 *  - pen:   draws with the current tool. Eraser end → eraser. Barrel button → picker.
 *           Hover (Apple Pencil hover, S Pen) shows the brush cursor.
 *  - touch: 1–2 fingers pan, 2 fingers pinch-zoom. 2-finger tap = undo, 3-finger tap = redo.
 *           While the pen is down all touches are ignored (palm rejection).
 *           Optional "finger draw" mode: one finger draws; a second finger cancels
 *           the stroke and turns it into a gesture.
 *  - mouse: left = tool, middle/right or Space+drag = pan, wheel = zoom,
 *           trackpad pinch (ctrl+wheel) = zoom, trackpad scroll = pan.
 */

interface Pt {
  x: number;
  y: number;
}

interface StrokeState {
  pointerId: number;
  pointerType: string;
  tool: Tool;
  /** Tool was chosen by hardware (eraser end / barrel button), not the toolbar. */
  override: boolean;
  last: Pt | null;
  value: number;
  startTime: number;
}

const TAP_MAX_MS = 280;
const TAP_MAX_MOVE = 12;

export class InputController {
  private el: HTMLCanvasElement;
  private rect = { left: 0, top: 0 };

  private stroke: StrokeState | null = null;
  private touches = new Map<number, Pt>();
  /** Touch ids to ignore until they lift (palm rejection). */
  private ignored = new Set<number>();
  private gesture: {
    c: Pt;
    d: number;
    start: number;
    maxTouches: number;
    moved: number;
  } | null = null;
  private mousePan: { id: number; last: Pt } | null = null;
  private spaceDown = false;
  private penDown = false;

  constructor(private editor: Editor) {
    this.el = editor.renderer.canvas;
    const el = this.el;
    el.style.touchAction = 'none';

    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onCancel);
    el.addEventListener('pointerleave', this.onLeave);
    el.addEventListener('wheel', this.onWheel, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    // iOS: stop magnifier / callout / native pinch on the canvas.
    el.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    el.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('gesturechange', (e) => e.preventDefault());

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', () => (this.spaceDown = false));

    const updateRect = () => {
      const r = el.getBoundingClientRect();
      this.rect = { left: r.left, top: r.top };
    };
    new ResizeObserver(updateRect).observe(el);
    window.addEventListener('scroll', updateRect, true);
    updateRect();
  }

  // ---------- helpers ----------

  private local(e: { clientX: number; clientY: number }): Pt {
    return { x: e.clientX - this.rect.left, y: e.clientY - this.rect.top };
  }

  private pixelAt(p: Pt): Pt {
    const [wx, wy] = this.editor.camera.toWorld(p.x, p.y);
    return { x: Math.floor(wx), y: Math.floor(wy) };
  }

  private setHover(p: Pt | null) {
    const r = this.editor.renderer;
    if (!p) {
      if (!r.hover) return;
      r.hover = null;
    } else {
      const px = this.pixelAt(p);
      const size = this.editor.tool.get() === 'picker' ? 1 : this.editor.brushSize.get();
      if (r.hover && r.hover.x === px.x && r.hover.y === px.y && r.hover.size === size) return;
      r.hover = { ...px, size };
    }
    r.requestRender();
  }

  // ---------- stroke ----------

  private startStroke(e: PointerEvent, tool: Tool, override: boolean) {
    const ed = this.editor;
    const value = tool === 'eraser' ? EMPTY : rgbToPixel(ed.color.get());
    this.stroke = {
      pointerId: e.pointerId,
      pointerType: e.pointerType,
      tool,
      override,
      last: null,
      value,
      startTime: performance.now(),
    };
    if (tool !== 'picker') ed.history.begin();
    this.continueStroke(this.local(e));
  }

  private continueStroke(p: Pt) {
    const s = this.stroke!;
    const ed = this.editor;
    const px = this.pixelAt(p);
    if (s.tool === 'picker') {
      ed.pickAt(px.x, px.y);
      s.last = px;
      return;
    }
    if (s.last && s.last.x === px.x && s.last.y === px.y) return;
    const from = s.last ?? px;
    this.line(from.x, from.y, px.x, px.y, s.value);
    s.last = px;
    ed.renderer.requestRender();
  }

  /** Bresenham line, stamping the brush at each step. */
  private line(x0: number, y0: number, x1: number, y1: number, value: number) {
    const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.stamp(x0, y0, value);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  private stamp(x: number, y: number, value: number) {
    const n = this.editor.brushSize.get();
    const h = this.editor.history;
    const ox = x - Math.floor((n - 1) / 2), oy = y - Math.floor((n - 1) / 2);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) h.set(ox + i, oy + j, value);
  }

  private endStroke(commit: boolean) {
    const s = this.stroke;
    if (!s) return;
    this.stroke = null;
    const ed = this.editor;
    if (s.tool === 'picker') {
      // After picking from the toolbar picker, go back to the pen.
      if (!s.override) ed.tool.set('pen');
      return;
    }
    if (commit) ed.history.commit();
    else ed.history.cancel();
    ed.changed();
  }

  // ---------- touch gesture ----------

  private touchFrame(): { c: Pt; d: number } {
    let cx = 0, cy = 0;
    const pts = [...this.touches.values()];
    for (const p of pts) { cx += p.x; cy += p.y; }
    cx /= pts.length; cy /= pts.length;
    let d = 0;
    if (pts.length >= 2) d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    return { c: { x: cx, y: cy }, d };
  }

  private beginOrResetGesture(start?: number) {
    const f = this.touchFrame();
    if (!this.gesture) {
      this.gesture = { ...f, start: start ?? performance.now(), maxTouches: this.touches.size, moved: 0 };
    } else {
      this.gesture.c = f.c;
      this.gesture.d = f.d;
      this.gesture.maxTouches = Math.max(this.gesture.maxTouches, this.touches.size);
    }
  }

  private applyGesture() {
    const g = this.gesture;
    if (!g || this.touches.size === 0) return;
    const f = this.touchFrame();
    const cam = this.editor.camera;
    const dx = f.c.x - g.c.x, dy = f.c.y - g.c.y;
    g.moved += Math.hypot(dx, dy);
    cam.pan(dx, dy);
    if (f.d > 0 && g.d > 0) {
      g.moved += Math.abs(f.d - g.d);
      cam.zoomAt(f.c.x, f.c.y, f.d / g.d);
    }
    g.c = f.c;
    g.d = f.d;
  }

  private endGesture() {
    const g = this.gesture;
    this.gesture = null;
    if (!g) return;
    this.editor.snapZoom(g.c.x, g.c.y);
    const quick = performance.now() - g.start < TAP_MAX_MS;
    if (quick && g.moved < TAP_MAX_MOVE) {
      if (g.maxTouches === 2) this.editor.undo();
      else if (g.maxTouches === 3) this.editor.redo();
    }
  }

  /** Drop all current touches (e.g. the palm when the pen lands). */
  private dropTouches() {
    for (const id of this.touches.keys()) this.ignored.add(id);
    this.touches.clear();
    this.gesture = null;
    if (this.stroke?.pointerType === 'touch') this.endStroke(true);
  }

  // ---------- pointer events ----------

  private onDown = (e: PointerEvent) => {
    e.preventDefault();
    const ed = this.editor;
    ed.lastPointer.set(e.pointerType === 'pen' ? 'pen' : e.pointerType === 'mouse' ? 'mouse' : 'touch');
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }

    if (e.pointerType === 'pen') {
      this.penDown = true;
      this.dropTouches();
      if (this.stroke) this.endStroke(true);
      let tool = ed.tool.get();
      let override = false;
      if (e.button === 5 || (e.buttons & 32) !== 0) { tool = 'eraser'; override = true; }
      else if (e.button === 2 || (e.buttons & 2) !== 0) { tool = 'picker'; override = true; }
      this.startStroke(e, tool, override);
      this.setHover(this.local(e));
      return;
    }

    if (e.pointerType === 'touch') {
      if (this.penDown) { this.ignored.add(e.pointerId); return; }
      this.touches.set(e.pointerId, this.local(e));
      const fingerDraw = ed.fingerDraw.get();
      if (fingerDraw && this.touches.size === 1 && !this.gesture) {
        this.startStroke(e, ed.tool.get(), false);
        return;
      }
      // A second finger during a finger stroke: it was a gesture after all.
      let start: number | undefined;
      if (this.stroke?.pointerType === 'touch') {
        start = this.stroke.startTime;
        this.endStroke(false);
      }
      this.beginOrResetGesture(start);
      return;
    }

    // mouse
    if (e.button === 1 || e.button === 2 || (e.button === 0 && this.spaceDown)) {
      this.mousePan = { id: e.pointerId, last: this.local(e) };
      this.el.style.cursor = 'grabbing';
      return;
    }
    if (e.button === 0) this.startStroke(e, ed.tool.get(), false);
  };

  private onMove = (e: PointerEvent) => {
    const p = this.local(e);

    if (e.pointerType === 'touch') {
      if (this.ignored.has(e.pointerId) || !this.touches.has(e.pointerId)) return;
      e.preventDefault();
      this.touches.set(e.pointerId, p);
      if (this.stroke?.pointerId === e.pointerId) {
        for (const ce of this.coalesced(e)) this.continueStroke(this.local(ce));
        return;
      }
      this.applyGesture();
      return;
    }

    if (this.mousePan?.id === e.pointerId) {
      this.editor.camera.pan(p.x - this.mousePan.last.x, p.y - this.mousePan.last.y);
      this.mousePan.last = p;
      return;
    }

    if (this.stroke?.pointerId === e.pointerId) {
      for (const ce of this.coalesced(e)) this.continueStroke(this.local(ce));
    }
    // Pen hover (buttons === 0) and mouse move both show the cursor.
    this.setHover(p);
  };

  private onUp = (e: PointerEvent) => {
    this.release(e, true);
  };

  private onCancel = (e: PointerEvent) => {
    // Browsers cancel pen strokes rarely and usually after real drawing; keep it.
    this.release(e, true);
  };

  private release(e: PointerEvent, commit: boolean) {
    if (this.stroke?.pointerId === e.pointerId) this.endStroke(commit);
    if (e.pointerType === 'pen') this.penDown = false;

    if (e.pointerType === 'touch') {
      this.ignored.delete(e.pointerId);
      if (this.touches.delete(e.pointerId) && this.gesture) {
        if (this.touches.size === 0) this.endGesture();
        else this.beginOrResetGesture();
      }
    }

    if (this.mousePan?.id === e.pointerId) {
      this.mousePan = null;
      this.el.style.cursor = this.spaceDown ? 'grab' : '';
    }
  }

  private onLeave = (e: PointerEvent) => {
    if (e.pointerType !== 'touch' && !this.stroke) this.setHover(null);
  };

  private coalesced(e: PointerEvent): PointerEvent[] {
    const list = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    return list.length ? list : [e];
  }

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const cam = this.editor.camera;
    const p = this.local(e);
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    const dx = e.deltaX * unit, dy = e.deltaY * unit;
    if (e.ctrlKey || e.metaKey) {
      // Trackpad pinch arrives as ctrl+wheel.
      cam.zoomAt(p.x, p.y, Math.exp(-dy * 0.01));
    } else if (e.deltaMode === 0 && (dx !== 0 || Math.abs(dy) < 40 || !Number.isInteger(dy))) {
      // Looks like a trackpad two-finger scroll → pan.
      cam.pan(-dx, -dy);
    } else {
      cam.zoomAt(p.x, p.y, Math.exp(-dy * 0.0025));
    }
    this.setHover(p);
  };

  // ---------- keyboard ----------

  private onKeyDown = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    const ed = this.editor;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();

    if (e.code === 'Space') {
      e.preventDefault();
      if (!this.spaceDown) {
        this.spaceDown = true;
        if (!this.mousePan) this.el.style.cursor = 'grab';
      }
      return;
    }
    if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? ed.redo() : ed.undo(); return; }
    if (mod && k === 'y') { e.preventDefault(); ed.redo(); return; }
    if (mod) return;
    switch (k) {
      case 'b': case 'p': ed.tool.set('pen'); break;
      case 'e': ed.tool.set('eraser'); break;
      case 'i': ed.tool.set('picker'); break;
      case '[': ed.brushSize.update((n) => Math.max(1, n - 1)); break;
      case ']': ed.brushSize.update((n) => Math.min(16, n + 1)); break;
      case '0': ed.resetView(); break;
      case '=': case '+': ed.zoomBy(1.25); break;
      case '-': ed.zoomBy(0.8); break;
      case 'g': ed.showGrid.update((v) => !v); break;
      default: return;
    }
    e.preventDefault();
  };

  private onKeyUp = (e: KeyboardEvent) => {
    if (e.code === 'Space') {
      this.spaceDown = false;
      if (!this.mousePan) this.el.style.cursor = '';
    }
  };
}
