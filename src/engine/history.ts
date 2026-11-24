import type { World } from './world';

/** Pixel changes made during one stroke. Only the first old value per pixel is kept. */
class Stroke {
  private index = new Map<string, number>();
  xs: number[] = [];
  ys: number[] = [];
  olds: number[] = [];
  news: number[] = [];

  record(x: number, y: number, oldV: number, newV: number) {
    const k = x + ',' + y;
    const i = this.index.get(k);
    if (i === undefined) {
      this.index.set(k, this.xs.length);
      this.xs.push(x);
      this.ys.push(y);
      this.olds.push(oldV);
      this.news.push(newV);
    } else {
      this.news[i] = newV;
    }
  }

  get size() {
    return this.xs.length;
  }
}

const LIMIT = 300;

export class History {
  private undoStack: Stroke[] = [];
  private redoStack: Stroke[] = [];
  private current: Stroke | null = null;

  onChange: () => void = () => {};

  constructor(private world: World) {}

  get canUndo() {
    return this.undoStack.length > 0;
  }
  get canRedo() {
    return this.redoStack.length > 0;
  }

  begin() {
    if (this.current) this.commit();
    this.current = new Stroke();
  }

  /** Set a pixel as part of the current stroke. */
  set(x: number, y: number, value: number) {
    const old = this.world.setPixel(x, y, value);
    if (old !== value) this.current?.record(x, y, old, value);
  }

  commit() {
    const s = this.current;
    this.current = null;
    if (!s || s.size === 0) return;
    this.undoStack.push(s);
    if (this.undoStack.length > LIMIT) this.undoStack.shift();
    this.redoStack.length = 0;
    this.onChange();
  }

  /** Undo the in-progress stroke's pixels but keep it open (live previews, e.g. the line tool). */
  rollbackCurrent() {
    const s = this.current;
    if (!s) return;
    for (let i = s.size - 1; i >= 0; i--) this.world.setPixel(s.xs[i], s.ys[i], s.olds[i]);
    this.current = new Stroke();
  }

  /** Revert the in-progress stroke without recording it. */
  cancel() {
    const s = this.current;
    this.current = null;
    if (!s) return;
    for (let i = s.size - 1; i >= 0; i--) this.world.setPixel(s.xs[i], s.ys[i], s.olds[i]);
  }

  undo() {
    if (this.current) this.commit();
    const s = this.undoStack.pop();
    if (!s) return;
    for (let i = s.size - 1; i >= 0; i--) this.world.setPixel(s.xs[i], s.ys[i], s.olds[i]);
    this.redoStack.push(s);
    this.onChange();
  }

  redo() {
    const s = this.redoStack.pop();
    if (!s) return;
    for (let i = 0; i < s.size; i++) this.world.setPixel(s.xs[i], s.ys[i], s.news[i]);
    this.undoStack.push(s);
    this.onChange();
  }

  reset() {
    this.undoStack = [];
    this.redoStack = [];
    this.current = null;
    this.onChange();
  }
}
