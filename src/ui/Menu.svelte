<script lang="ts">
  import type { Editor } from '../engine/editor';

  let { editor, onclose }: { editor: Editor; onclose: () => void } = $props();
  // svelte-ignore state_referenced_locally
  const { fingerDraw, showGrid } = editor;

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
