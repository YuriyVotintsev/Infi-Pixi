<script lang="ts">
  import type { Editor, Tool } from '../engine/editor';
  import Icon from './Icon.svelte';
  import Palette from './Palette.svelte';
  import ToolSettings from './ToolSettings.svelte';
  import { press } from './press';
  import Menu from './Menu.svelte';
  import ZoomMenu, { fmtZoom } from './ZoomMenu.svelte';
  import { rgbToHex } from '../engine/color';
  import { newVersion, applyUpdate } from './updates';

  let { editor }: { editor: Editor } = $props();
  // svelte-ignore state_referenced_locally
  const { tool, color, penSize, eraserSize, zoom, canUndo, canRedo } = editor;

  /**
   * Bottom panel. 'palette' is the quick swatch strip (tap on the color button);
   * the rest are settings, opened by a long press on their toolbar button.
   */
  type Panel = null | 'palette' | 'palette-settings' | 'pen' | 'eraser';
  let panel = $state<Panel>(null);
  const isSettings = $derived(panel !== null && panel !== 'palette');
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

  function tapTool(t: Tool) {
    tool.set(t);
    if (isSettings) panel = null;
  }

  function longTool(t: Tool) {
    tool.set(t);
    // The picker has no settings.
    panel = t === 'picker' ? null : t;
  }

  function sizeOf(t: Tool): number {
    return t === 'pen' ? $penSize : t === 'eraser' ? $eraserSize : 1;
  }

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

{#if $newVersion}
  <button class="panel update" onclick={applyUpdate}>
    Новая версия <code>{$newVersion}</code> · <b>Обновить</b>
  </button>
{/if}

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
      ✌️ Тап двумя пальцами: отмена, тремя: повтор<br />
      👆 Долгое нажатие на инструмент или цвет открывает настройки
    </div>
    <button class="hint-ok" onclick={dismissHint}>Понятно</button>
  </div>
{/if}

{#if isSettings}
  <button class="backdrop" onclick={() => (panel = null)} aria-label="Закрыть настройки"></button>
{/if}

<div class="bottom">
  {#if panel === 'palette'}
    <Palette {editor} onclose={() => (panel = null)} />
  {:else if panel === 'palette-settings'}
    <Palette {editor} full onclose={() => (panel = null)} />
  {:else if panel === 'pen' || panel === 'eraser'}
    {#key panel}
      <ToolSettings {editor} tool={panel} />
    {/key}
  {/if}

  <div class="panel toolbar">
    {#each tools as t (t.id)}
      <button
        class="icon-btn"
        class:active={$tool === t.id}
        class:open={panel === t.id}
        use:press={{ tap: () => tapTool(t.id), long: () => longTool(t.id) }}
        aria-label={t.label}
        title={t.id === 'picker' ? t.label : `${t.label} (удерживать: настройки)`}
      >
        <Icon name={t.id} />
        {#if t.id !== 'picker' && sizeOf(t.id) > 1}
          <span class="badge">{sizeOf(t.id)}</span>
        {/if}
      </button>
    {/each}

    <div class="sep"></div>

    <button
      class="icon-btn swatch-btn"
      class:open={panel === 'palette' || panel === 'palette-settings'}
      use:press={{
        tap: () => (panel = panel === 'palette' || panel === 'palette-settings' ? null : 'palette'),
        long: () => (panel = 'palette-settings'),
      }}
      aria-label="Палитра"
      title="Палитра (удерживать: настройки)"
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
  .update {
    position: absolute;
    top: calc(var(--safe-t) + 64px);
    left: 50%;
    transform: translateX(-50%);
    padding: 10px 14px;
    white-space: nowrap;
    border-color: var(--accent);
  }
  .update code {
    font-size: 12px;
    color: var(--fg-dim);
  }
  .update b {
    color: var(--accent);
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
  .icon-btn {
    position: relative;
  }
  .icon-btn.open:not(.active) {
    background: rgba(255, 255, 255, 0.1);
  }
  .badge {
    position: absolute;
    right: 3px;
    bottom: 2px;
    min-width: 14px;
    font-size: 10px;
    line-height: 14px;
    border-radius: 7px;
    padding: 0 3px;
    background: rgba(0, 0, 0, 0.45);
    color: #fff;
    font-variant-numeric: tabular-nums;
  }
  .backdrop {
    position: absolute;
    inset: 0;
    pointer-events: auto;
    cursor: default;
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
