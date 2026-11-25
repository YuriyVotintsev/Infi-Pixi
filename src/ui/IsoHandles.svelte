<script lang="ts">
  import type { Editor } from '../engine/editor';
  import { normalize, type Box } from '../engine/isocube';

  let { editor }: { editor: Editor } = $props();
  // svelte-ignore state_referenced_locally
  const { view, isoBox, isoStage } = editor;

  /**
   * Each size handle sits on a corner and moves freely in one face plane, so it
   * stays under the finger and changes two dimensions at once (the opposite
   * corner stays put):
   *   'xz' right-top corner  → ↘ length + height
   *   'yz' left-top corner   → ↙ length + height
   *   'xy' front-bottom corner → ↘ + ↙ lengths (moves on the floor)
   *   'move' top-face centre → moves the whole box
   */
  type Kind = 'xz' | 'yz' | 'xy' | 'move';

  /** Screen-space world position (centre of the 2-px corner run) of corner(i, j, k). */
  function corner(bx: Box, i: number, j: number, k: number): [number, number] {
    return [bx.ox + 2 * bx.a * i - 2 * bx.b * j + 1, bx.oy + bx.a * i + bx.b * j - bx.h * k + 0.5];
  }

  function handles(raw: Box): { kind: Kind; x: number; y: number; label: string }[] {
    const bx = normalize(raw);
    const [rx, ry] = corner(bx, 1, 0, 1);
    const [lx, ly] = corner(bx, 0, 1, 1);
    const [fx, fy] = corner(bx, 1, 1, 0);
    const [t0x, t0y] = corner(bx, 0, 0, 1);
    const [t1x, t1y] = corner(bx, 1, 1, 1);
    return [
      { kind: 'xz', x: rx, y: ry, label: 'Длина ↘ и высота' },
      { kind: 'yz', x: lx, y: ly, label: 'Длина ↙ и высота' },
      { kind: 'xy', x: fx, y: fy, label: 'Длины ↘ и ↙' },
      { kind: 'move', x: (t0x + t1x) / 2, y: (t0y + t1y) / 2, label: 'Переместить' },
    ];
  }

  function startDrag(kind: Kind, e: PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const raw = editor.isoBox.get();
    if (!raw) return;
    // Work on the normalized box so "right"/"left"/"front" mean what they show.
    const start = normalize(raw);
    const sx = e.clientX, sy = e.clientY;
    let last = '';
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      const z = editor.camera.zoom;
      const dx = (ev.clientX - sx) / z, dy = (ev.clientY - sy) / z; // world pixels
      const r = Math.round;
      const next: Box = { ...start };
      // Decompose the drag into two box axes: X = (2, 1), Y = (−2, 1), Z = (0, −1).
      if (kind === 'xz') {
        const da = dx / 2;
        next.a = start.a + r(da);
        next.h = start.h + r(da - dy);
      } else if (kind === 'yz') {
        const db = -dx / 2;
        next.b = start.b + r(db);
        next.h = start.h + r(db - dy);
      } else if (kind === 'xy') {
        next.a = start.a + r((dy + dx / 2) / 2);
        next.b = start.b + r((dy - dx / 2) / 2);
      } else {
        next.ox = start.ox + r(dx);
        next.oy = start.oy + r(dy);
      }
      const key = JSON.stringify(next);
      if (key !== last) {
        last = key;
        editor.setIsoBox(next);
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
</script>

{#if $isoStage === 'edit' && $isoBox}
  {#each handles($isoBox) as hd (hd.kind)}
    <button
      class="handle {hd.kind}"
      style:transform="translate({hd.x * $view.zoom + $view.x}px, {hd.y * $view.zoom + $view.y}px)"
      onpointerdown={(e) => startDrag(hd.kind, e)}
      aria-label={hd.label}
      title={hd.label}
    >
      {#if hd.kind === 'move'}<span>✥</span>{/if}
    </button>
  {/each}
{/if}

<style>
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
  /* Visible dot inside a bigger touch target. */
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
  .handle.xy::before {
    border-color: #2fbf71;
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
