/**
 * .infipixi file format
 *
 *   magic   "IPXF"            4 bytes
 *   version u8 (= 1)
 *   flags   u8 (bit 0: payload is gzip-compressed)
 *   payload (optionally gzipped):
 *     u32le   header length
 *     header  UTF-8 JSON (see FileHeader)
 *     blobs   raw bytes referenced by [offset, length] from the header
 *
 * Chunks are stored as raw RGBA (CHUNK×CHUNK×4); gzip makes empty areas ~free.
 */
import type { Backdrop, Editor } from './editor';
import type { RefImage } from './references';
import { CHUNK } from './world';

export const EXTENSION = '.infipixi';
const MAGIC = [0x49, 0x50, 0x58, 0x46]; // "IPXF"
const VERSION = 1;

interface FileHeader {
  app: 'infi-pixi';
  version: number;
  savedAt: string;
  chunkSize: number;
  chunks: { k: string; o: number; n: number }[];
  refs: { meta: Omit<RefImage, 'url'>; type: string; o: number; n: number }[];
  settings: {
    paletteId: string;
    paletteEdits: Record<string, number[]>;
    color: number;
    penSize: number;
    eraserSize: number;
    backdrop: Backdrop;
  };
  /** View centre in world pixels and zoom in device pixels per art pixel. */
  view: { cx: number; cy: number; zoom: number };
}

// ---------- save ----------

export async function serialize(ed: Editor): Promise<Blob> {
  ed.selection.clear(); // stamp any floating pixels first

  const parts: BlobPart[] = [];
  let offset = 0;
  const push = (bytes: Uint8Array) => {
    parts.push(bytes as Uint8Array<ArrayBuffer>);
    const o = offset;
    offset += bytes.byteLength;
    return { o, n: bytes.byteLength };
  };

  const chunks: FileHeader['chunks'] = [];
  for (const c of ed.world.chunks.values()) {
    if (ed.world.isEmpty(c)) continue;
    chunks.push({ k: c.key, ...push(c.data) });
  }

  const refs: FileHeader['refs'] = [];
  for (const { meta, blob } of ed.references.snapshot()) {
    refs.push({ meta, type: blob.type, ...push(new Uint8Array(await blob.arrayBuffer())) });
  }

  const r = ed.renderer;
  const [cx, cy] = ed.camera.toWorld(r.width / 2, r.height / 2);
  const header: FileHeader = {
    app: 'infi-pixi',
    version: VERSION,
    savedAt: new Date().toISOString(),
    chunkSize: CHUNK,
    chunks,
    refs,
    settings: {
      paletteId: ed.paletteId.get(),
      paletteEdits: ed.paletteEdits.get(),
      color: ed.color.get(),
      penSize: ed.penSize.get(),
      eraserSize: ed.eraserSize.get(),
      backdrop: ed.backdrop.get(),
    },
    view: { cx, cy, zoom: ed.zoom.get() },
  };

  const headerBytes = new TextEncoder().encode(JSON.stringify(header));
  const len = new Uint8Array(4);
  new DataView(len.buffer).setUint32(0, headerBytes.byteLength, true);
  const payload = new Blob([len, headerBytes, ...parts]);

  const gz = typeof CompressionStream !== 'undefined';
  const body = gz ? await new Response(payload.stream().pipeThrough(new CompressionStream('gzip'))).blob() : payload;
  return new Blob([new Uint8Array([...MAGIC, VERSION, gz ? 1 : 0]), body], { type: 'application/octet-stream' });
}

// ---------- load ----------

export async function deserialize(ed: Editor, file: Blob): Promise<void> {
  const head = new Uint8Array(await file.slice(0, 6).arrayBuffer());
  if (head.length < 6 || MAGIC.some((b, i) => head[i] !== b)) throw new Error('Это не файл Infi-Pixi');
  if (head[4] > VERSION) throw new Error('Файл из более новой версии приложения, обновите страницу');
  const gz = (head[5] & 1) !== 0;

  let body: Blob = file.slice(6);
  if (gz) {
    if (typeof DecompressionStream === 'undefined') throw new Error('Браузер не умеет распаковывать файл');
    body = await new Response(body.stream().pipeThrough(new DecompressionStream('gzip'))).blob();
  }
  const buf = new Uint8Array(await body.arrayBuffer());
  const hlen = new DataView(buf.buffer, buf.byteOffset, 4).getUint32(0, true);
  const header = JSON.parse(new TextDecoder().decode(buf.subarray(4, 4 + hlen))) as FileHeader;
  if (header.app !== 'infi-pixi') throw new Error('Это не файл Infi-Pixi');
  if (header.chunkSize !== CHUNK) throw new Error('Неподдерживаемый размер чанка');
  const blobs = buf.subarray(4 + hlen);
  const slice = (o: number, n: number) => blobs.slice(o, o + n);

  // Pixels: replace the whole world.
  await ed.clearAll();
  for (const c of header.chunks) {
    ed.world.loadChunk(c.k, slice(c.o, c.n));
    ed.world.saveDirty.add(c.k);
  }
  ed.storage.flush();

  // References.
  await ed.references.replaceAll(
    header.refs.map((r) => ({ meta: r.meta, blob: new Blob([slice(r.o, r.n)], { type: r.type }) })),
  );

  // Settings (each optional, so older/newer files degrade gracefully).
  const s = header.settings ?? ({} as Partial<FileHeader['settings']>);
  if (s.paletteEdits) ed.paletteEdits.set(s.paletteEdits);
  if (s.paletteId) ed.paletteId.set(s.paletteId);
  if (typeof s.color === 'number') ed.color.set(s.color);
  if (typeof s.penSize === 'number') ed.penSize.set(s.penSize);
  if (typeof s.eraserSize === 'number') ed.eraserSize.set(s.eraserSize);
  if (s.backdrop) ed.backdrop.set(s.backdrop);

  // View.
  const v = header.view;
  if (v && [v.cx, v.cy, v.zoom].every(Number.isFinite)) {
    const r = ed.renderer;
    ed.camera.centerOn(v.cx, v.cy, v.zoom / ed.dpr, r.width, r.height);
  } else ed.resetView();
  ed.renderer.requestRender();
}

// ---------- platform helpers ----------

export function defaultFileName(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `infi-pixi-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${EXTENSION}`;
}

type SavePicker = (opts: {
  suggestedName: string;
  types: { description: string; accept: Record<string, string[]> }[];
}) => Promise<{ createWritable(): Promise<{ write(b: Blob): Promise<void>; close(): Promise<void> }> }>;

/**
 * Save a blob: native "Save as" where available (desktop Chrome/Edge), else the
 * share sheet (mobile → Files / Google Drive), else a regular download.
 * Returns false if the user cancelled.
 */
export async function saveBlob(blob: Blob, name: string): Promise<boolean> {
  const picker = (window as unknown as { showSaveFilePicker?: SavePicker }).showSaveFilePicker;
  if (picker) {
    try {
      const handle = await picker({
        suggestedName: name,
        types: [{ description: 'Infi-Pixi', accept: { 'application/octet-stream': [EXTENSION] } }],
      });
      const w = await handle.createWritable();
      await w.write(blob);
      await w.close();
      return true;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return false;
      // fall through to other methods
    }
  }

  const file = new File([blob], name, { type: blob.type || 'application/octet-stream' });
  const coarse = matchMedia('(pointer: coarse)').matches;
  if (coarse && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return true;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return false;
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}

/** Let the user pick a file. No `accept` filter: iOS greys out unknown extensions. */
export function pickFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.style.display = 'none';
    input.addEventListener('change', () => {
      resolve(input.files?.[0] ?? null);
      input.remove();
    });
    input.addEventListener('cancel', () => {
      resolve(null);
      input.remove();
    });
    document.body.appendChild(input);
    input.click();
  });
}

// ---------- user-facing actions ----------

export async function saveToFile(ed: Editor): Promise<void> {
  try {
    const blob = await serialize(ed);
    await saveBlob(blob, defaultFileName());
  } catch (e) {
    alert('Не удалось сохранить: ' + (e as Error).message);
  }
}

export async function openFromFile(ed: Editor, file?: File | null): Promise<void> {
  file ??= await pickFile();
  if (!file) return;
  const hasWork = ed.world.chunks.size > 0 || ed.references.items.get().length > 0;
  if (hasWork && !confirm(`Открыть «${file.name}»? Текущий рисунок будет заменён.`)) return;
  try {
    await deserialize(ed, file);
  } catch (e) {
    alert('Не удалось открыть файл: ' + (e as Error).message);
  }
}
