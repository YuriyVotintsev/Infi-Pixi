<script lang="ts">
  import { BACKDROPS, type Editor } from '../engine/editor';
  import { MAX_SIZE } from '../engine/input';
  import { rgbToHex } from '../engine/color';
  import Icon from './Icon.svelte';

  let { editor, tool }: { editor: Editor; tool: 'pen' | 'eraser' } = $props();

  // svelte-ignore state_referenced_locally
  const size = editor.sizeStore(tool)!;
  // svelte-ignore state_referenced_locally
  const { color, backdrop } = editor;
  const chk = $derived(BACKDROPS[$backdrop].colors.map(rgbToHex));

  const QUICK = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 24, 32];
  const title = $derived(tool === 'pen' ? 'Карандаш' : 'Ластик');

  const set = (n: number) => size.set(Math.max(1, Math.min(MAX_SIZE, Math.round(n))));
  // Preview cell: how big one art pixel is drawn, so the whole brush fits in 72px.
  const cell = $derived(Math.max(2, Math.floor(72 / Math.max($size, 4))));
</script>

<div class="panel settings" role="dialog" aria-label="Настройки: {title}">
  <div class="head">
    <Icon name={tool} size={18} />
    <span class="title">{title}</span>
  </div>

  <div class="row" style:--a={chk[0]} style:--b={chk[1]}>
    <div class="preview" style:width="{$size * cell}px" style:height="{$size * cell}px"
      style:background={tool === 'pen' ? rgbToHex($color) : 'transparent'}
      class:eraser={tool === 'eraser'}
      style:--cell="{cell}px"></div>
  </div>

  <div class="stepper">
    <button class="step" onclick={() => set($size - 1)} disabled={$size <= 1} aria-label="Меньше">−</button>
    <span class="value">{$size}<small>px</small></span>
    <button class="step" onclick={() => set($size + 1)} disabled={$size >= MAX_SIZE} aria-label="Больше">+</button>
  </div>

  <input
    class="slider"
    type="range"
    min="1"
    max={MAX_SIZE}
    step="1"
    value={$size}
    oninput={(e) => set(+e.currentTarget.value)}
    aria-label="Размер"
  />

  <div class="quick">
    {#each QUICK as n (n)}
      <button class="q" class:active={$size === n} onclick={() => set(n)}>{n}</button>
    {/each}
  </div>
</div>

<style>
  .settings {
    padding: 12px;
    width: min(320px, 100%);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--fg-dim);
  }
  .title {
    color: var(--fg);
    font-weight: 600;
  }
  .row {
    height: 80px;
    display: grid;
    place-items: center;
    border-radius: 10px;
    background: repeating-conic-gradient(var(--a) 0 25%, var(--b) 0 50%) 0 0 / 16px 16px;
  }
  .preview {
    max-width: 76px;
    max-height: 76px;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.25);
  }
  .preview.eraser {
    box-shadow: none;
    outline: 1px dashed rgba(0, 0, 0, 0.6);
    background: rgba(255, 255, 255, 0.35) !important;
  }
  .stepper {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .step {
    width: 44px;
    height: 44px;
    border-radius: 10px;
    font-size: 22px;
    background: rgba(255, 255, 255, 0.06);
  }
  .value {
    font-size: 22px;
    font-variant-numeric: tabular-nums;
  }
  .value small {
    font-size: 12px;
    color: var(--fg-dim);
    margin-left: 2px;
  }
  .slider {
    width: 100%;
    accent-color: var(--accent);
    height: 28px;
    touch-action: pan-x;
  }
  .quick {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 4px;
  }
  .q {
    height: 36px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.05);
    font-variant-numeric: tabular-nums;
  }
  .q.active {
    background: var(--accent);
    color: #fff;
  }
</style>
