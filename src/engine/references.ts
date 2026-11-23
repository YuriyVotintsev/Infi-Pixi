import { createStore, del, entries, set } from 'idb-keyval';
import { store } from './store';

/** A reference image placed in world coordinates (art pixels). */
export interface RefImage {
  id: string;
  name: string;
  /** Top-left corner and width in world (art pixel) units; height follows the aspect ratio. */
  x: number;
  y: number;
  w: number;
  /** Natural image size. */
  iw: number;
  ih: number;
  opacity: number;
  /** Object URL for display. */
  url: string;
}

interface Stored {
  meta: Omit<RefImage, 'url'>;
  blob: Blob;
}

const db = createStore('infi-pixi-refs', 'refs');
/** Imported images are downscaled to this many pixels on the long side. */
const MAX_SIDE = 2048;

export class References {
  readonly items = store<RefImage[]>([]);
  private blobs = new Map<string, Blob>();
  private pixels = new Map<string, ImageData>();
  private saveTimers = new Map<string, ReturnType<typeof setTimeout>>();

  async load() {
    try {
      const all = await entries<string, Stored>(db);
      const items: RefImage[] = [];
      for (const [, s] of all) {
        this.blobs.set(s.meta.id, s.blob);
        items.push({ ...s.meta, url: URL.createObjectURL(s.blob) });
      }
      this.items.set(items);
    } catch (e) {
      console.warn('Failed to load references', e);
    }
  }

  /** Add an image file, centred on world point (cx, cy) and `worldWidth` wide. */
  async add(file: Blob, name: string, cx: number, cy: number, worldWidth: number) {
    const { blob, w: iw, h: ih } = await normalize(file);
    const w = Math.max(4, Math.round(worldWidth));
    const h = (w * ih) / iw;
    const ref: RefImage = {
      id: Math.random().toString(36).slice(2, 10),
      name: name || 'Референс',
      x: Math.round(cx - w / 2),
      y: Math.round(cy - h / 2),
      w,
      iw,
      ih,
      opacity: 1,
      url: URL.createObjectURL(blob),
    };
    this.blobs.set(ref.id, blob);
    this.items.update((list) => [...list, ref]);
    this.save(ref.id, 0);
  }

  update(id: string, patch: Partial<Pick<RefImage, 'x' | 'y' | 'w' | 'opacity'>>) {
    this.items.update((list) => list.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    this.save(id);
  }

  /** Move a reference to the top of the stack. */
  raise(id: string) {
    const list = this.items.get();
    const i = list.findIndex((r) => r.id === id);
    if (i < 0 || i === list.length - 1) return;
    this.items.set([...list.slice(0, i), ...list.slice(i + 1), list[i]]);
  }

  remove(id: string) {
    const r = this.items.get().find((x) => x.id === id);
    if (r) URL.revokeObjectURL(r.url);
    this.items.update((list) => list.filter((x) => x.id !== id));
    this.blobs.delete(id);
    this.pixels.delete(id);
    clearTimeout(this.saveTimers.get(id));
    del(id, db).catch(() => {});
  }

  /** Color (0xRRGGBB) at normalized position (u, v) in the image, or null if transparent. */
  async colorAt(id: string, u: number, v: number): Promise<number | null> {
    let img = this.pixels.get(id);
    if (!img) {
      const blob = this.blobs.get(id);
      if (!blob) return null;
      const bmp = await createImageBitmap(blob);
      const c = document.createElement('canvas');
      c.width = bmp.width;
      c.height = bmp.height;
      const ctx = c.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(bmp, 0, 0);
      img = ctx.getImageData(0, 0, c.width, c.height);
      this.pixels.set(id, img);
    }
    const x = Math.min(img.width - 1, Math.max(0, Math.floor(u * img.width)));
    const y = Math.min(img.height - 1, Math.max(0, Math.floor(v * img.height)));
    const i = (y * img.width + x) * 4;
    if (img.data[i + 3] < 128) return null;
    return (img.data[i] << 16) | (img.data[i + 1] << 8) | img.data[i + 2];
  }

  private save(id: string, delay = 400) {
    clearTimeout(this.saveTimers.get(id));
    this.saveTimers.set(
      id,
      setTimeout(() => {
        const r = this.items.get().find((x) => x.id === id);
        const blob = this.blobs.get(id);
        if (!r || !blob) return;
        const { url: _url, ...meta } = r;
        set(id, { meta, blob } satisfies Stored, db).catch((e) => console.warn('ref save failed', e));
      }, delay),
    );
  }
}

/** Decode the image; downscale big photos so storage and memory stay sane. */
async function normalize(file: Blob): Promise<{ blob: Blob; w: number; h: number }> {
  const bmp = await createImageBitmap(file);
  const { width: w, height: h } = bmp;
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  if (scale === 1) return { blob: file, w, h };
  const c = document.createElement('canvas');
  c.width = Math.round(w * scale);
  c.height = Math.round(h * scale);
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise<Blob>((res, rej) =>
    c.toBlob((b) => (b ? res(b) : rej(new Error('encode failed'))), 'image/webp', 0.92),
  );
  return { blob, w: c.width, h: c.height };
}
