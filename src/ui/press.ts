/**
 * Svelte action: distinguishes a tap from a long press on a button.
 * Works the same for finger, stylus and mouse. A long press swallows the
 * click that follows it, so `tap` and `long` never both fire.
 */
export interface PressOptions {
  tap: () => void;
  long?: () => void;
}

const LONG_MS = 420;
const MOVE_TOLERANCE = 12;

export function press(node: HTMLElement, options: PressOptions) {
  let opts = options;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let start: { x: number; y: number } | null = null;
  let firedLong = false;

  const cancel = () => {
    clearTimeout(timer);
    timer = undefined;
    start = null;
  };

  const down = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    firedLong = false;
    start = { x: e.clientX, y: e.clientY };
    clearTimeout(timer);
    if (opts.long) {
      timer = setTimeout(() => {
        firedLong = true;
        start = null;
        navigator.vibrate?.(10);
        opts.long?.();
      }, LONG_MS);
    }
  };

  const move = (e: PointerEvent) => {
    if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > MOVE_TOLERANCE) cancel();
  };

  const click = (e: MouseEvent) => {
    if (firedLong) {
      firedLong = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    opts.tap();
  };

  // Android fires contextmenu on long press; iOS may show a callout.
  const contextmenu = (e: Event) => e.preventDefault();

  node.addEventListener('pointerdown', down);
  node.addEventListener('pointermove', move);
  node.addEventListener('pointerup', cancel);
  node.addEventListener('pointercancel', cancel);
  node.addEventListener('pointerleave', cancel);
  node.addEventListener('click', click);
  node.addEventListener('contextmenu', contextmenu);

  return {
    update(o: PressOptions) {
      opts = o;
    },
    destroy() {
      cancel();
      node.removeEventListener('pointerdown', down);
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', cancel);
      node.removeEventListener('pointercancel', cancel);
      node.removeEventListener('pointerleave', cancel);
      node.removeEventListener('click', click);
      node.removeEventListener('contextmenu', contextmenu);
    },
  };
}
