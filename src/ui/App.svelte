<script lang="ts">
  import type { Editor, Tool } from '../engine/editor';
  import Icon from './Icon.svelte';
  import Palette from './Palette.svelte';
  import Menu from './Menu.svelte';
  import ZoomMenu, { fmtZoom } from './ZoomMenu.svelte';
  import { rgbToHex } from '../engine/color';

  let { editor }: { editor: Editor } = $props();
  // svelte-ignore state_referenced_locally
  const { tool, color, brushSize, zoom, canUndo, canRedo } = editor;

  let paletteOpen = $state(false);
  let menuOpen = $state(false);
  let zoomOpen = $state(false);
  let hint = $state(true);

  try {
    hint = localStorage.getItem('infi-pixi:hintSeen') !== '1';
  } catch {}

  function dismissHint() {
    hint = false;
    try {
      localStorage.setItem('infi-pixi:hintSeen', '1');
    } catch {}
  }

  const tools: { id: Tool; label: string }[] = [
    { id: 'pen', label: 'Карандаш' },
    { id: 'eraser', label: 'Ластик' },
    { id: 'picker', label: 'Пипетка' },
  ];
  const SIZES = [1, 2, 3, 4, 6, 8];

  // ---- fullscreen ----
  type FsDoc = Document & {
    webkitFullscreenEnabled?: boolean;
    webkitFullscreenElement?: Element | null;
    webkitExitFullscreen?: () => Promise<void>;
  };
  type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
  const doc = document as FsDoc;
  const fsSupported = !!(doc.fullscreenEnabled || doc.webkitFullscreenEnabled);
  // Already running as an installed app without browser chrome: no button needed.
  const standalone =
    matchMedia('(display-mode: fullscreen)').matches ||
    matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  let isFullscreen = $state(false);
  const syncFs = () => (isFullscreen = !!(doc.fullscreenElement || doc.webkitFullscreenElement));
  document.addEventListener('fullscreenchange', syncFs);
  document.addEventListener('webkitfullscreenchange', syncFs);

  async function toggleFullscreen() {
    if (!fsSupported) {
      alert(
        'Этот браузер не умеет полноэкранный режим для сайтов (так на iPhone).\n\n' +
          'Добавьте приложение на главный экран: «Поделиться» → «На экран Домой». ' +
          'Оттуда оно откроется без панелей браузера.',
      );
      return;
    }
    try {
      if (isFullscreen) {
        await (doc.exitFullscreen ? doc.exitFullscreen() : doc.webkitExitFullscreen?.());
      } else {
        const el = document.documentElement as FsEl;
        await (el.requestFullscreen
          ? el.requestFullscreen({ navigationUI: 'hide' })
          : el.webkitRequestFullscreen?.());
      }
    } catch (e) {
      console.warn('fullscreen failed', e);
    }
  }

  function cycleSize() {
    const i = SIZES.indexOf($brushSize);
    brushSize.set(SIZES[(i + 1) % SIZES.length]);
  }
</script>

<div class="top-left build">{__BUILD_SHA__}</div>

<div class="top-right">
  {#if !standalone}
    <button
      class="panel icon-btn"
      onclick={toggleFullscreen}
      aria-label={isFullscreen ? 'Выйти из полноэкранного режима' : 'Полный экран'}
      title={isFullscreen ? 'Выйти из полноэкранного режима' : 'Полный экран'}
    >
      <Icon name={isFullscreen ? 'shrink' : 'expand'} />
    </button>
  {/if}
  <button
    class="panel pill"
    class:open={zoomOpen}
    onclick={() => {
      zoomOpen = !zoomOpen;
      menuOpen = false;
    }}
    aria-label="Масштаб"
    aria-expanded={zoomOpen}
  >
    {fmtZoom($zoom)}
  </button>
  <button
    class="panel icon-btn"
    onclick={() => {
      menuOpen = !menuOpen;
      zoomOpen = false;
    }}
    aria-label="Меню"
  >
    <Icon name="menu" />
  </button>
</div>

{#if zoomOpen}
  <ZoomMenu {editor} onclose={() => (zoomOpen = false)} />
{/if}

{#if menuOpen}
  <Menu {editor} onclose={() => (menuOpen = false)} />
{/if}

{#if hint}
  <div class="panel hint">
    <div>
      ✍️ Стилус рисует<br />
      🤏 Пальцы двигают и зумят<br />
      ✌️ Тап двумя пальцами: отмена, тремя: повтор
    </div>
    <button class="hint-ok" onclick={dismissHint}>Понятно</button>
  </div>
{/if}

<div class="bottom">
  {#if paletteOpen}
    <Palette {editor} onclose={() => (paletteOpen = false)} />
  {/if}

  <div class="panel toolbar">
    {#each tools as t (t.id)}
      <button
        class="icon-btn"
        class:active={$tool === t.id}
        onclick={() => tool.set(t.id)}
        aria-label={t.label}
        title={t.label}
      >
        <Icon name={t.id} />
      </button>
    {/each}

    <div class="sep"></div>

    <button class="icon-btn size" onclick={cycleSize} title="Размер кисти">
      <span class="size-dot" style:width="{4 + $brushSize * 2}px" style:height="{4 + $brushSize * 2}px"></span>
      <span class="size-num">{$brushSize}</span>
    </button>

    <button
      class="icon-btn swatch-btn"
      onclick={() => (paletteOpen = !paletteOpen)}
      aria-label="Палитра"
      title="Палитра"
    >
      <span class="swatch" style:background={rgbToHex($color)}></span>
    </button>

    <div class="sep"></div>

    <button class="icon-btn" onclick={() => editor.undo()} disabled={!$canUndo} aria-label="Отменить">
      <Icon name="undo" />
    </button>
    <button class="icon-btn" onclick={() => editor.redo()} disabled={!$canRedo} aria-label="Повторить">
      <Icon name="redo" />
    </button>
  </div>
</div>

<style>
  .top-left {
    position: absolute;
    top: calc(var(--safe-t) + 8px);
    left: calc(var(--safe-l) + 10px);
  }
  .build {
    font: 11px ui-monospace, monospace;
    color: rgba(0, 0, 0, 0.45);
  }
  .top-right {
    position: absolute;
    top: calc(var(--safe-t) + 8px);
    right: calc(var(--safe-r) + 8px);
    display: flex;
    gap: 6px;
  }
  .pill {
    height: 44px;
    min-width: 56px;
    padding: 0 12px;
    font-variant-numeric: tabular-nums;
  }
  .pill.open {
    border-color: var(--accent);
  }
  .bottom {
    position: absolute;
    left: 0;
    right: 0;
    bottom: calc(var(--safe-b) + 10px);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 0 8px;
  }
  .toolbar {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 4px;
    max-width: 100%;
    overflow-x: auto;
  }
  .icon-btn {
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    border-radius: 10px;
    flex: none;
  }
  .icon-btn.active {
    background: var(--accent);
    color: #fff;
  }
  .sep {
    width: 1px;
    height: 28px;
    background: var(--panel-border);
    margin: 0 4px;
    flex: none;
  }
  .size {
    position: relative;
  }
  .size-dot {
    background: currentColor;
    border-radius: 2px;
  }
  .size-num {
    position: absolute;
    right: 4px;
    bottom: 2px;
    font-size: 10px;
    color: var(--fg-dim);
  }
  .swatch {
    width: 28px;
    height: 28px;
    border-radius: 8px;
    border: 2px solid rgba(255, 255, 255, 0.85);
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.5);
  }
  .hint {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    padding: 16px 18px;
    width: min(320px, calc(100vw - 32px));
    line-height: 1.7;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .hint-ok {
    align-self: flex-end;
    background: var(--accent);
    color: #fff;
    padding: 10px 16px;
    border-radius: 10px;
  }
</style>
