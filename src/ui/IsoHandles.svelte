<script lang="ts">
  import type { Editor } from '../engine/editor';
  import type { Box } from '../engine/isocube';

  let { editor }: { editor: Editor } = $props();
  // svelte-ignore state_referenced_locally
  const { view, isoBox, isoStage } = editor;

  type Kind = 'a' | 'b' | 'h' | 'move';

  /** World position (centre of the 2-px corner run) of corner(i, j, k) of the raw box. */
  function corner(bx: Box, i: number, j: number, k: number): [number, number] {
    return [bx.ox + 2 * bx.a * i - 2 * bx.b * j + 1, bx.oy + bx.a * i + bx.b * j - bx.h * k + 0.5];
  }

  function handles(bx: Box): { kind: Kind; x: number; y: number; label: string }[] {
    const [ax, ay] = corner(bx, 1, 0, 0);
    const [bx2, by] = corner(bx, 0, 1, 0);
    const [hx, hy] = corner(bx, 0, 0, 1);
    // Centre of the top face (k = 1): usually clear of the other handles.
    const [c0x, c0y] = corner(bx, 0, 0, 1);
    const [c1x, c1y] = corner(bx, 1, 1, 1);
    return [
      { kind: 'a', x: ax, y: ay, label: 'Длина ↘' },
      { kind: 'b', x: bx2, y: by, label: 'Длина ↙' },
      { kind: 'h', x: hx, y: hy, label: 'Высота' },
      { kind: 'move', x: (c0x + c1x) / 2, y: (c0y + c1y) / 2, label: 'Переместить' },
    ];
  }

  function startDrag(kind: Kind, e: PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const start = editor.isoBox.get();
    if (!start) return;
    const sx = e.clientX, sy = e.clientY;
    let last = '';
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      const z = editor.camera.zoom;
      const dx = (ev.clientX - sx) / z, dy = (ev.clientY - sy) / z; // world pixels
      const r = Math.round;
      const next: Box = { ...start };
      if (kind === 'a') next.a = start.a + r((2 * dx + dy) / 5); // along X = (2, 1)
      else if (kind === 'b') next.b = start.b + r((-2 * dx + dy) / 5); // along Y = (−2, 1)
      else if (kind === 'h') next.h = start.h - r(dy);
      else {
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
  .handle.h::before {
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
