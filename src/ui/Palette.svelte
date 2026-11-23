<script lang="ts">
  import type { Editor } from '../engine/editor';
  import { hexToRgb, rgbToHex } from '../engine/color';
  import Icon from './Icon.svelte';
  import { PALETTES } from '../engine/palettes';

  /** `full` = settings view (preset choice, add/remove colors); otherwise just swatches. */
  let { editor, full = false, onclose }: { editor: Editor; full?: boolean; onclose: () => void } = $props();
  // svelte-ignore state_referenced_locally
  const { palette, color, tool, paletteId, paletteEdits } = editor;
  const edited = $derived($paletteId in $paletteEdits);

  let editing = $state(false);

  function pick(c: number) {
    if (editing) {
      editor.removeColor(c);
      return;
    }
    color.set(c);
    if ($tool !== 'pen') tool.set('pen');
  }

  function onCustom(e: Event) {
    editor.addColor(hexToRgb((e.target as HTMLInputElement).value));
  }
</script>

<div class="panel palette" class:compact={!full}>
  {#if full}
  <div class="head">
    <select
      class="select"
      value={$paletteId}
      onchange={(e) => {
        paletteId.set(e.currentTarget.value);
        editing = false;
      }}
      aria-label="Палитра"
    >
      {#each PALETTES as p (p.id)}
        <option value={p.id}>{p.name} · {p.colors.length}</option>
      {/each}
    </select>
    {#if edited}
      <button class="link small" onclick={() => editor.resetPalette()} title="Вернуть исходные цвета палитры">
        Сбросить
      </button>
    {/if}
  </div>
  {/if}
  <div class="grid">
    {#each $palette as c (c)}
      <button
        class="sw"
        class:selected={c === $color && !editing}
        class:editing
        style:background={rgbToHex(c)}
        onclick={() => pick(c)}
        aria-label={rgbToHex(c)}
      ></button>
    {/each}
    {#if full}
    <label class="sw add" title="Свой цвет">
      <Icon name="plus" size={18} />
      <input type="color" value={rgbToHex($color)} onchange={onCustom} />
    </label>
    {/if}
  </div>
  {#if full}
  <div class="row">
    <button class="link" onclick={() => (editing = !editing)}>
      {editing ? 'Готово' : 'Удалить цвета'}
    </button>
    <span class="hex">{rgbToHex($color)}</span>
    <button class="link" onclick={onclose}>Закрыть</button>
  </div>
  {/if}
</div>

<style>
  .palette {
    padding: 10px;
    width: min(380px, 100%);
  }
  .palette.compact {
    padding: 8px;
  }
  .compact .grid {
    max-height: min(34vh, 260px);
  }
  .head {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
  }
  .select {
    flex: 1;
    min-width: 0;
    height: 40px;
    padding: 0 32px 0 12px;
    border-radius: 10px;
    border: 1px solid var(--panel-border);
    background: rgba(255, 255, 255, 0.06)
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%239a9aa8' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")
      no-repeat right 10px center / 16px;
    color: var(--fg);
    font: inherit;
    appearance: none;
    -webkit-appearance: none;
  }
  .select option {
    background: #26262e;
    color: var(--fg);
  }
  .small {
    font-size: 13px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(34px, 1fr));
    gap: 5px;
    max-height: min(46vh, 360px);
    overflow-y: auto;
    padding: 3px;
    margin: -3px;
  }
  .sw {
    aspect-ratio: 1;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    position: relative;
    display: grid;
    place-items: center;
  }
  .sw.selected {
    outline: 2px solid #fff;
    outline-offset: 2px;
  }
  .sw.editing::after {
    content: '×';
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    font-size: 20px;
    color: #fff;
    text-shadow: 0 0 3px #000;
  }
  .add {
    background: rgba(255, 255, 255, 0.06);
    color: var(--fg-dim);
    cursor: pointer;
    overflow: hidden;
  }
  .add input {
    position: absolute;
    inset: 0;
    opacity: 0;
    width: 100%;
    height: 100%;
    cursor: pointer;
  }
  .row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 10px;
  }
  .link {
    color: var(--accent);
    padding: 8px 4px;
  }
  .hex {
    font: 12px ui-monospace, monospace;
    color: var(--fg-dim);
  }
</style>
