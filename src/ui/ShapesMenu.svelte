<script lang="ts">
  import { SHAPE_TOOLS, type Editor, type ShapeTool } from '../engine/editor';
  import Icon from './Icon.svelte';

  /** First layer of the "Фигуры" menu: pick a shape, or open its settings (second layer). */
  let {
    editor,
    onpick,
    onsettings,
  }: { editor: Editor; onpick: (t: ShapeTool) => void; onsettings: (t: ShapeTool) => void } = $props();
  // svelte-ignore state_referenced_locally
  const { tool } = editor;

  const LABELS: Record<ShapeTool, string> = { line: 'Линия', iso: 'Изометрический куб', ellipse: 'Круг / эллипс' };
</script>

<div class="panel shapes" role="menu" aria-label="Фигуры">
  {#each SHAPE_TOOLS as t (t)}
    <div class="row" class:active={$tool === t}>
      <button class="pick" role="menuitem" onclick={() => onpick(t)}>
        <Icon name={t} size={20} />
        <span>{LABELS[t]}</span>
      </button>
      <button class="more" onclick={() => onsettings(t)} aria-label="Настройки: {LABELS[t]}" title="Настройки">
        <Icon name="chevron-right" size={18} />
      </button>
    </div>
  {/each}
</div>

<style>
  .shapes {
    padding: 6px;
    width: min(300px, 100%);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .row {
    display: flex;
    align-items: center;
    border-radius: 10px;
  }
  .row.active {
    background: rgba(91, 140, 255, 0.16);
  }
  .pick {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 10px;
    height: 44px;
    padding: 0 10px;
    text-align: left;
    border-radius: 10px;
  }
  .row.active .pick {
    color: #fff;
  }
  .more {
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    border-radius: 10px;
    color: var(--fg-dim);
    border-left: 1px solid var(--panel-border);
  }
  .pick:active,
  .more:active {
    background: rgba(255, 255, 255, 0.08);
  }
</style>
