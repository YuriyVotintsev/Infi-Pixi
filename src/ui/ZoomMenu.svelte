<script lang="ts" module>
  export function fmtZoom(z: number): string {
    if (z >= 10) return `${Math.round(z)}×`;
    return `${z.toFixed(z < 1 ? 2 : 1).replace(/\.?0+$/, '')}×`;
  }
</script>

<script lang="ts">
  import type { Editor } from '../engine/editor';

  let { editor, onclose }: { editor: Editor; onclose: () => void } = $props();
  // svelte-ignore state_referenced_locally
  const { zoom } = editor;

  const PRESETS = [1, 2, 4, 8, 16, 32, 64];

  function run(fn: () => void) {
    fn();
    onclose();
  }
</script>

<button class="backdrop" onclick={onclose} aria-label="Закрыть"></button>
<div class="panel zoom-menu" role="menu">
  <button class="item" role="menuitem" onclick={() => run(() => editor.resetView())}>
    Показать рисунок
  </button>
  <button class="item" role="menuitem" onclick={() => run(() => editor.goToOrigin())}>
    К началу координат
  </button>
  <div class="divider"></div>
  <div class="steps">
    <button class="step" onclick={() => editor.zoomBy(1 / 1.5)} aria-label="Уменьшить">−</button>
    <span class="cur">{fmtZoom($zoom)}</span>
    <button class="step" onclick={() => editor.zoomBy(1.5)} aria-label="Увеличить">+</button>
  </div>
  <div class="presets">
    {#each PRESETS as z (z)}
      <button
        class="preset"
        class:active={Math.abs($zoom - z) < 0.01}
        onclick={() => run(() => editor.zoomTo(z))}
      >
        {z}×
      </button>
    {/each}
  </div>
</div>

<style>
  .backdrop {
    position: absolute;
    inset: 0;
    pointer-events: auto;
    cursor: default;
  }
  .zoom-menu {
    position: absolute;
    top: calc(var(--safe-t) + 60px);
    right: calc(var(--safe-r) + 58px);
    width: 220px;
    padding: 6px;
    display: flex;
    flex-direction: column;
  }
  .item {
    min-height: 44px;
    padding: 0 10px;
    border-radius: 8px;
    text-align: left;
  }
  .item:active,
  .step:active,
  .preset:active {
    background: rgba(255, 255, 255, 0.08);
  }
  .divider {
    height: 1px;
    background: var(--panel-border);
    margin: 4px 0;
  }
  .steps {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 2px 0;
  }
  .step {
    width: 44px;
    height: 44px;
    border-radius: 8px;
    font-size: 22px;
  }
  .cur {
    font-variant-numeric: tabular-nums;
    color: var(--fg-dim);
  }
  .presets {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
    padding-top: 4px;
  }
  .preset {
    height: 40px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.04);
    font-variant-numeric: tabular-nums;
  }
  .preset.active {
    background: var(--accent);
    color: #fff;
  }
</style>
