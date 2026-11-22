import { EMPTY } from './color';

export const CHUNK = 64;
const CHUNK_PX = CHUNK * CHUNK;

export interface Chunk {
  cx: number;
  cy: number;
  key: string;
  /** RGBA bytes, uploaded to the GPU as-is. */
  data: Uint8Array;
  /** Same memory viewed as one uint32 per pixel. */
  px: Uint32Array;
}

export function chunkKey(cx: number, cy: number): string {
  return cx + ',' + cy;
}

/** Sparse, unbounded pixel plane split into CHUNK×CHUNK tiles. */
export class World {
  readonly chunks = new Map<string, Chunk>();
  /** Chunks whose pixels changed since the renderer last looked. */
  readonly renderDirty = new Set<Chunk>();
  /** Chunk keys changed since the last save. */
  readonly saveDirty = new Set<string>();

  onChunkAdded: (c: Chunk) => void = () => {};
  onChunkRemoved: (c: Chunk) => void = () => {};

  private makeChunk(cx: number, cy: number, data?: Uint8Array): Chunk {
    const buf = data ?? new Uint8Array(CHUNK_PX * 4);
    const c: Chunk = {
      cx,
      cy,
      key: chunkKey(cx, cy),
      data: buf,
      px: new Uint32Array(buf.buffer, buf.byteOffset, CHUNK_PX),
    };
    this.chunks.set(c.key, c);
    this.onChunkAdded(c);
    return c;
  }

  loadChunk(key: string, data: Uint8Array): void {
    const [cx, cy] = key.split(',').map(Number);
    if (data.length !== CHUNK_PX * 4) return;
    // Copy into a fresh, 4-byte aligned buffer.
    this.makeChunk(cx, cy, new Uint8Array(data));
  }

  getPixel(x: number, y: number): number {
    const cx = Math.floor(x / CHUNK);
    const cy = Math.floor(y / CHUNK);
    const c = this.chunks.get(chunkKey(cx, cy));
    if (!c) return EMPTY;
    return c.px[(y - cy * CHUNK) * CHUNK + (x - cx * CHUNK)];
  }

  /** Sets a pixel and returns its previous value. */
  setPixel(x: number, y: number, value: number): number {
    const cx = Math.floor(x / CHUNK);
    const cy = Math.floor(y / CHUNK);
    let c = this.chunks.get(chunkKey(cx, cy));
    if (!c) {
      if (value === EMPTY) return EMPTY;
      c = this.makeChunk(cx, cy);
    }
    const i = (y - cy * CHUNK) * CHUNK + (x - cx * CHUNK);
    const old = c.px[i];
    if (old !== value) {
      c.px[i] = value;
      this.renderDirty.add(c);
      this.saveDirty.add(c.key);
    }
    return old;
  }

  isEmpty(c: Chunk): boolean {
    const px = c.px;
    for (let i = 0; i < px.length; i++) if (px[i] !== EMPTY) return false;
    return true;
  }

  removeChunk(c: Chunk): void {
    if (this.chunks.get(c.key) !== c) return;
    this.chunks.delete(c.key);
    this.renderDirty.delete(c);
    this.onChunkRemoved(c);
  }

  clear(): void {
    for (const c of [...this.chunks.values()]) {
      this.saveDirty.add(c.key);
      this.removeChunk(c);
    }
  }

  /** Tight bounding box of all non-empty pixels, or null if the world is blank. */
  bounds(): { x: number; y: number; w: number; h: number } | null {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const c of this.chunks.values()) {
      const ox = c.cx * CHUNK, oy = c.cy * CHUNK;
      for (let i = 0; i < CHUNK_PX; i++) {
        if (c.px[i] === EMPTY) continue;
        const x = ox + (i % CHUNK), y = oy + ((i / CHUNK) | 0);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (minX === Infinity) return null;
    return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  }
}
