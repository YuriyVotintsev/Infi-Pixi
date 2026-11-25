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
    iso: 'M12 3l8 4.5v9L12 21l-8-4.5v-9z M4 7.5l8 4.5 8-4.5 M12 12v9',
    ellipse: 'M12 4.5a7.5 7.5 0 1 0 0 15a7.5 7.5 0 1 0 0-15z',
    line: 'M5 19L19 5 M3.5 17.5h3v3h-3z M17.5 3.5h3v3h-3z',
    select: 'M4 8V4h4 M10 4h4 M16 4h4v4 M20 10v4 M20 16v4h-4 M14 20h-4 M8 20H4v-4 M4 14v-4',
    cut: 'M6 7a2.5 2.5 0 1 0 0 .01 M6 17a2.5 2.5 0 1 0 0 .01 M8.2 8.3L20 18 M8.2 15.7L20 6',
    copy: 'M9 9h10v10H9z M15 9V5H5v10h4',
    paste: 'M9 4h6v3H9z M7 5.5H5V20h14V5.5h-2 M9 12h6 M9 16h4',
    trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13 M10 11v6 M14 11v6',
    check: 'M5 12.5l4.5 4.5L19 7.5',
    expand: 'M4 9V4h5 M20 9V4h-5 M4 15v5h5 M20 15v5h-5',
    shrink: 'M9 4v5H4 M15 4v5h5 M9 20v-5H4 M15 20v-5h5',
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
