<script lang="ts">
  import type { Editor } from '../engine/editor';
  import type { RefImage } from '../engine/references';
  import Icon from './Icon.svelte';

  let { editor }: { editor: Editor } = $props();
  // svelte-ignore state_referenced_locally
  const { view, tool, color } = editor;
  // svelte-ignore state_referenced_locally
  const refs = editor.references;
  const items = refs.items;
  const active = refs.active;
  const hovered = refs.hovered;

  const OPACITIES = [1, 0.7, 0.4];
  /** Header height + gap, CSS px. */
  const BAR = 38;

  /** Pointer-drag helper: calls `move(dx, dy)` in CSS px relative to the press point. */
  function dragger(onStart: () => void, move: (dx: number, dy: number) => void) {
    return (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if ((e.target as HTMLElement).closest('button')) return;
      e.preventDefault();
      e.stopPropagation();
      const el = e.currentTarget as HTMLElement;
      el.setPointerCapture(e.pointerId);
      const sx = e.clientX, sy = e.clientY;
      onStart();
      const mv = (ev: PointerEvent) => {
        if (ev.pointerId !== e.pointerId) return;
        move(ev.clientX - sx, ev.clientY - sy);
      };
      const up = (ev: PointerEvent) => {
        if (ev.pointerId !== e.pointerId) return;
        el.removeEventListener('pointermove', mv);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
      };
      el.addEventListener('pointermove', mv);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    };
  }

  function startMove(r: RefImage) {
    let x0 = 0, y0 = 0;
    return dragger(
      () => {
        refs.active.set(r.id);
        x0 = r.x;
        y0 = r.y;
        refs.raise(r.id);
      },
      (dx, dy) => refs.update(r.id, { x: x0 + dx / $view.zoom, y: y0 + dy / $view.zoom }),
    );
  }

  function startResize(r: RefImage) {
    let w0 = 0;
    return dragger(
      () => {
        refs.active.set(r.id);
        w0 = r.w;
        refs.raise(r.id);
      },
      // Keep the aspect ratio; follow whichever axis moved more.
      (dx, dy) => {
        const byX = dx, byY = (dy * r.iw) / r.ih;
        const d = Math.abs(byX) > Math.abs(byY) ? byX : byY;
        refs.update(r.id, { w: Math.max(4, w0 + d / $view.zoom) });
      },
    );
  }

  async function pick(r: RefImage, e: PointerEvent) {
    const img = e.currentTarget as HTMLImageElement;
    const rect = img.getBoundingClientRect();
    const c = await refs.colorAt(r.id, (e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height);
    if (c != null) color.set(c);
    tool.set('pen');
  }

  function nextOpacity(r: RefImage) {
    const i = OPACITIES.findIndex((o) => Math.abs(o - r.opacity) < 0.01);
    refs.update(r.id, { opacity: OPACITIES[(i + 1) % OPACITIES.length] });
  }
</script>

{#each $items as r (r.id)}
  {@const W = r.w * $view.zoom}
  {@const H = (W * r.ih) / r.iw}
  {@const Y = r.y * $view.zoom + $view.y}
  <!-- Header sits above the image, but sticks to the top of the screen while the image is visible. -->
  {@const barTop = Math.min(Math.max(-BAR, 8 - Y), H - BAR)}
  {@const X = r.x * $view.zoom + $view.x}
  {@const barW = Math.min(Math.max(W, 150), 320)}
  {@const barLeft = Math.min(Math.max(0, 8 - X), Math.max(0, W - barW))}
  <div
    class="ref"
    class:on={r.id === $active || r.id === $hovered}
    style:transform="translate({X}px, {Y}px)"
    style:width="{W}px"
    style:height="{H}px"
  >
    {#if r.id === $active || r.id === $hovered}
    <div class="bar panel" style:top="{barTop}px" style:left="{barLeft}px" style:width="{barW}px" role="toolbar" aria-label="Референс: {r.name}" tabindex="-1" onpointerdown={startMove(r)}>
      <span class="grip" aria-hidden="true">⠿</span>
      <span class="name">{r.name}</span>
      <button class="b" onclick={() => nextOpacity(r)} aria-label="Прозрачность" title="Прозрачность">
        {Math.round(r.opacity * 100)}%
      </button>
      <button class="b" onclick={() => refs.remove(r.id)} aria-label="Закрыть референс" title="Закрыть">
        <Icon name="close" size={16} />
      </button>
    </div>
    {/if}
    <img
      src={r.url}
      alt={r.name}
      draggable="false"
      style:opacity={r.opacity}
      class:pickable={$tool === 'picker'}
      class:pixelated={W / r.iw >= 2}
      onpointerdown={(e) => $tool === 'picker' && pick(r, e)}
    />
    {#if r.id === $active || r.id === $hovered}
    <div class="resize" onpointerdown={startResize(r)} aria-label="Изменить размер" role="slider" aria-valuenow={Math.round(r.w)} tabindex="-1"></div>
    {/if}
  </div>
{/each}

<style>
  .ref {
    position: absolute;
    left: 0;
    top: 0;
    transform-origin: 0 0;
    will-change: transform;
    pointer-events: none;
  }
  .ref.on img {
    outline: 2px solid var(--accent);
  }
  img {
    display: block;
    width: 100%;
    height: 100%;
    outline: 1px solid rgba(0, 0, 0, 0.35);
    box-shadow: 0 4px 18px rgba(0, 0, 0, 0.25);
    user-select: none;
    -webkit-user-drag: none;
    /* Touches and the pen pass through to the canvas (pan/zoom keep working)… */
    pointer-events: none;
  }
  /* …except with the picker, which samples the reference's colors. */
  img.pickable {
    pointer-events: auto;
    cursor: crosshair;
  }
  img.pixelated {
    image-rendering: pixelated;
  }
  .bar {
    position: absolute;
    left: 0;
    height: 34px;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 0 2px 0 8px;
    border-radius: 10px !important;
    cursor: grab;
    touch-action: none;
  }
  .grip {
    color: var(--fg-dim);
    font-size: 14px;
  }
  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    color: var(--fg-dim);
    padding: 0 4px;
  }
  .b {
    height: 30px;
    min-width: 34px;
    padding: 0 6px;
    border-radius: 8px;
    font-size: 12px;
    display: grid;
    place-items: center;
    font-variant-numeric: tabular-nums;
  }
  .b:active {
    background: rgba(255, 255, 255, 0.1);
  }
  .resize {
    position: absolute;
    right: -14px;
    bottom: -14px;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--panel);
    border: 2px solid var(--accent);
    pointer-events: auto;
    touch-action: none;
    cursor: nwse-resize;
  }
</style>
