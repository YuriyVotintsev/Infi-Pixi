<script lang="ts">
  import { BACKDROPS, type Backdrop, type Editor } from '../engine/editor';
  import { rgbToHex } from '../engine/color';

  let { editor, onclose }: { editor: Editor; onclose: () => void } = $props();
  // svelte-ignore state_referenced_locally
  const { fingerDraw, showGrid, backdrop } = editor;
  const backdrops = Object.entries(BACKDROPS) as [Backdrop, (typeof BACKDROPS)[Backdrop]][];

  async function exportPNG(scale: number) {
    const blob = await editor.exportPNG(scale);
    if (!blob) {
      alert('Холст пустой');
      return;
    }
    const name = `infi-pixi-${Date.now()}.png`;
    const file = new File([blob], name, { type: 'image/png' });
    // Mobile: native share sheet lets you save to Photos/Files.
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  let fileInput: HTMLInputElement;

  async function onRefFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    onclose();
    try {
      await editor.addReference(file, file.name.replace(/\.[^.]+$/, ''));
    } catch (err) {
      alert('Не удалось открыть изображение: ' + (err as Error).message);
    }
  }

  async function clearAll() {
    if (confirm('Очистить весь холст? Это нельзя отменить.')) {
      await editor.clearAll();
      onclose();
    }
  }

  const built = new Date(__BUILD_TIME__).toLocaleString();
</script>

<button class="backdrop" onclick={onclose} aria-label="Закрыть меню"></button>
<div class="panel menu">
  <label class="item">
    <span>Рисовать пальцем</span>
    <input type="checkbox" checked={$fingerDraw} onchange={(e) => fingerDraw.set(e.currentTarget.checked)} />
  </label>
  <label class="item">
    <span>Сетка</span>
    <input type="checkbox" checked={$showGrid} onchange={(e) => showGrid.set(e.currentTarget.checked)} />
  </label>
  <div class="item static">
    <span>Фон</span>
  </div>
  <div class="seg" role="radiogroup" aria-label="Фон">
    {#each backdrops as [id, b] (id)}
      <button
        class="seg-btn"
        class:active={$backdrop === id}
        role="radio"
        aria-checked={$backdrop === id}
        onclick={() => backdrop.set(id)}
      >
        <span class="chk" style:--a={rgbToHex(b.colors[0])} style:--b={rgbToHex(b.colors[1])}></span>
        {b.label}
      </button>
    {/each}
  </div>
  <div class="divider"></div>
  <button class="item" onclick={() => fileInput.click()}>Добавить референс…</button>
  <input bind:this={fileInput} type="file" accept="image/*" hidden onchange={onRefFile} />
  <div class="divider"></div>
  <button class="item" onclick={() => exportPNG(1)}>Экспорт PNG 1×</button>
  <button class="item" onclick={() => exportPNG(8)}>Экспорт PNG 8×</button>
  <div class="divider"></div>
  <button class="item danger" onclick={clearAll}>Очистить холст</button>
  <div class="meta">
    build {__BUILD_SHA__} · {built}<br />
    <a href="?debug">консоль (?debug)</a>
  </div>
</div>

<style>
  .backdrop {
    position: absolute;
    inset: 0;
    pointer-events: auto;
    cursor: default;
  }
  .menu {
    position: absolute;
    top: calc(var(--safe-t) + 60px);
    right: calc(var(--safe-r) + 8px);
    width: 240px;
    padding: 6px;
    display: flex;
    flex-direction: column;
  }
  .item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    min-height: 44px;
    padding: 0 10px;
    border-radius: 8px;
    text-align: left;
    cursor: pointer;
  }
  .item:active {
    background: rgba(255, 255, 255, 0.06);
  }
  .item input {
    width: 20px;
    height: 20px;
    accent-color: var(--accent);
  }
  .static {
    min-height: 32px;
    cursor: default;
  }
  .seg {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
    padding: 0 4px 6px;
  }
  .seg-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 6px 2px;
    border-radius: 8px;
    font-size: 12px;
    color: var(--fg-dim);
    border: 1px solid transparent;
  }
  .seg-btn.active {
    color: var(--fg);
    border-color: var(--accent);
    background: rgba(91, 140, 255, 0.12);
  }
  .chk {
    width: 32px;
    height: 20px;
    border-radius: 4px;
    background: repeating-conic-gradient(var(--a) 0 25%, var(--b) 0 50%) 0 0 / 8px 8px;
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.15);
  }
  .danger {
    color: #ff6b6b;
  }
  .divider {
    height: 1px;
    background: var(--panel-border);
    margin: 4px 0;
  }
  .meta {
    padding: 8px 10px 4px;
    font-size: 11px;
    color: var(--fg-dim);
    line-height: 1.6;
  }
  .meta a {
    color: var(--fg-dim);
  }
</style>
