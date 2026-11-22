<script lang="ts">
  import type { Editor } from '../engine/editor';
  import { hexToRgb, rgbToHex } from '../engine/color';
  import Icon from './Icon.svelte';

  let { editor, onclose }: { editor: Editor; onclose: () => void } = $props();
  // svelte-ignore state_referenced_locally
  const { palette, color, tool } = editor;

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

<div class="panel palette">
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
    <label class="sw add" title="Свой цвет">
      <Icon name="plus" size={18} />
      <input type="color" value={rgbToHex($color)} onchange={onCustom} />
    </label>
  </div>
  <div class="row">
    <button class="link" onclick={() => (editing = !editing)}>
      {editing ? 'Готово' : 'Удалить цвета'}
    </button>
    <span class="hex">{rgbToHex($color)}</span>
    <button class="link" onclick={onclose}>Закрыть</button>
  </div>
</div>

<style>
  .palette {
    padding: 10px;
    width: min(360px, 100%);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(36px, 1fr));
    gap: 6px;
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
