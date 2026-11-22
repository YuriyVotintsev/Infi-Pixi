import { createStore, delMany, entries, setMany, clear } from 'idb-keyval';
import type { World } from './world';

const db = createStore('infi-pixi', 'chunks');

/** Persists world chunks to IndexedDB, debounced. */
export class Storage {
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private world: World) {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.flush();
    });
    window.addEventListener('pagehide', () => this.flush());
  }

  async load(): Promise<void> {
    try {
      const all = await entries<string, Uint8Array>(db);
      for (const [key, data] of all) this.world.loadChunk(key, data);
    } catch (e) {
      console.warn('Failed to load chunks', e);
    }
    this.world.saveDirty.clear();
  }

  scheduleSave() {
    if (this.timer) return;
    this.timer = setTimeout(() => this.flush(), 800);
  }

  flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const w = this.world;
    if (w.saveDirty.size === 0) return;
    const put: [string, Uint8Array][] = [];
    const del: string[] = [];
    for (const key of w.saveDirty) {
      const c = w.chunks.get(key);
      if (!c || w.isEmpty(c)) {
        del.push(key);
        if (c) w.removeChunk(c);
      } else {
        put.push([key, c.data.slice()]);
      }
    }
    w.saveDirty.clear();
    if (put.length) setMany(put, db).catch((e) => console.warn('save failed', e));
    if (del.length) delMany(del, db).catch((e) => console.warn('delete failed', e));
  }

  async wipe() {
    await clear(db);
  }
}
