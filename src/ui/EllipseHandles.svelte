<script lang="ts">
  import type { Editor } from '../engine/editor';
  import type { Rect } from '../engine/ellipse';

  let { editor }: { editor: Editor } = $props();
  // svelte-ignore state_referenced_locally
  const { view, ellRect, ellipseCircle } = editor;

  /** Corner handles move that corner freely (opposite corner fixed); 'move' shifts it all. */
  type Kind = 'tl' | 'tr' | 'bl' | 'br' | 'move';

  function handles(r: Rect): { kind: Kind; x: number; y: number }[] {
    // Pixel edges of the inclusive rect.
    const L = r.x0, T = r.y0, R = r.x1 + 1, B = r.y1 + 1;
    return [
      { kind: 'tl', x: L, y: T },
      { kind: 'tr', x: R, y: T },
      { kind: 'bl', x: L, y: B },
      { kind: 'br', x: R, y: B },
      { kind: 'move', x: (L + R) / 2, y: (T + B) / 2 },
    ];
  }

  function startDrag(kind: Kind, e: PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const start = editor.ellRect.get();
    if (!start) return;
    const sx = e.clientX, sy = e.clientY;
    let last = '';
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      const z = editor.camera.zoom;
      let dx = Math.round((ev.clientX - sx) / z), dy = Math.round((ev.clientY - sy) / z);
      const r = { ...start };
      if (kind === 'move') {
        r.x0 += dx; r.x1 += dx; r.y0 += dy; r.y1 += dy;
      } else {
        const left = kind === 'tl' || kind === 'bl', top = kind === 'tl' || kind === 'tr';
        if (left) r.x0 += dx; else r.x1 += dx;
        if (top) r.y0 += dy; else r.y1 += dy;
        if (ellipseCircle.get() || ev.shiftKey) {
          // Keep it round: square side from the larger extent, opposite corner fixed.
          const w = (left ? start.x1 - r.x0 : r.x1 - start.x0), h = (top ? start.y1 - r.y0 : r.y1 - start.y0);
          const d = Math.max(Math.abs(w), Math.abs(h));
          const sw = w < 0 ? -d : d, sh = h < 0 ? -d : d;
          if (left) r.x0 = start.x1 - sw; else r.x1 = start.x0 + sw;
          if (top) r.y0 = start.y1 - sh; else r.y1 = start.y0 + sh;
        }
      }
      const key = JSON.stringify(r);
      if (key !== last) {
        last = key;
        editor.setEllRect(r);
      }
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      editor.changed();
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  const LABELS: Record<Kind, string> = {
    tl: 'Левый верхний угол', tr: 'Правый верхний угол', bl: 'Левый нижний угол', br: 'Правый нижний угол', move: 'Переместить',
  };
</script>

{#if $ellRect}
  {@const r = $ellRect}
  <div
    class="frame"
    style:transform="translate({r.x0 * $view.zoom + $view.x}px, {r.y0 * $view.zoom + $view.y}px)"
    style:width="{(r.x1 - r.x0 + 1) * $view.zoom}px"
    style:height="{(r.y1 - r.y0 + 1) * $view.zoom}px"
  ></div>
  {#each handles(r) as hd (hd.kind)}
    <button
      class="handle {hd.kind}"
      style:transform="translate({hd.x * $view.zoom + $view.x}px, {hd.y * $view.zoom + $view.y}px)"
      onpointerdown={(e) => startDrag(hd.kind, e)}
      aria-label={LABELS[hd.kind]}
      title={LABELS[hd.kind]}
    >
      {#if hd.kind === 'move'}<span>✥</span>{/if}
    </button>
  {/each}
{/if}

<style>
  .frame {
    position: absolute;
    left: 0;
    top: 0;
    outline: 1px dashed rgba(91, 140, 255, 0.9);
    pointer-events: none;
  }
  .handle {
    position: absolute;
    left: -16px;
    top: -16px;
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    pointer-events: auto;
    touch-action: none;
    cursor: grab;
    border-radius: 50%;
  }
  .handle::before {
    content: '';
    position: absolute;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #fff;
    border: 3px solid var(--accent);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
  }
  .handle.move::before {
    width: 22px;
    height: 22px;
    background: var(--accent);
    border-color: #fff;
  }
  .handle.move span {
    position: relative;
    color: #fff;
    font-size: 14px;
    line-height: 1;
  }
</style>
