<script lang="ts">
  let { name, size = 22 }: { name: string; size?: number } = $props();

  const paths: Record<string, string> = {
    pen: 'M4 20l1-4L16 5l3 3L8 19l-4 1z M14 7l3 3',
    eraser: 'M9 20h11 M4.5 15.5l9-9a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L11 19H8l-3.5-3.5z M9 11l5 5',
    picker: 'M19.5 4.5a2.1 2.1 0 0 0-3 0L14 7l-1-1-1.5 1.5 5 5L18 11l-1-1 2.5-2.5a2.1 2.1 0 0 0 0-3z M12.5 9.5L5 17v2h2l7.5-7.5',
    undo: 'M9 14L4 9l5-5 M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
    redo: 'M15 14l5-5-5-5 M20 9H9.5a5.5 5.5 0 0 0 0 11H13',
    menu: 'M5 12h.01 M12 12h.01 M19 12h.01',
    plus: 'M12 5v14 M5 12h14',
    close: 'M6 6l12 12 M18 6L6 18',
  };
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width={name === 'menu' ? 3.2 : 1.8}
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <path d={paths[name]} />
</svg>
