/** Ellipse inscribed in an inclusive pixel rectangle (corners in any order). */
export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function normRect(r: Rect): Rect {
  return {
    x0: Math.min(r.x0, r.x1),
    y0: Math.min(r.y0, r.y1),
    x1: Math.max(r.x0, r.x1),
    y1: Math.max(r.y0, r.y1),
  };
}

/** Rectangle from a drag; `circle` forces equal sides (kept on the drag's side). */
export function dragRect(x0: number, y0: number, x1: number, y1: number, circle: boolean): Rect {
  if (!circle) return { x0, y0, x1, y1 };
  const d = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  return { x0, y0, x1: x0 + (x1 >= x0 ? d : -d), y1: y0 + (y1 >= y0 ? d : -d) };
}

/**
 * Outline pixels of the ellipse inside `r` — Alois Zingl's rectangle ellipse
 * algorithm, exact for both even and odd widths/heights.
 */
export function ellipseOutline(r: Rect): [number, number][] {
  let { x0, y0, x1, y1 } = normRect(r);
  const out: [number, number][] = [];
  const put = (x: number, y: number) => out.push([x, y]);

  let a = x1 - x0;
  const b = y1 - y0;
  let b1 = b & 1;
  let dx = 4 * (1 - a) * b * b;
  let dy = 4 * (b1 + 1) * a * a;
  let err = dx + dy + b1 * a * a;
  y0 += (b + 1) >> 1;
  y1 = y0 - b1;
  a = 8 * a * a;
  b1 = 8 * b * b;
  do {
    put(x1, y0);
    put(x0, y0);
    put(x0, y1);
    put(x1, y1);
    const e2 = 2 * err;
    if (e2 <= dy) {
      y0++;
      y1--;
      err += dy += a;
    }
    if (e2 >= dx || 2 * err > dy) {
      x0++;
      x1--;
      err += dx += b1;
    }
  } while (x0 <= x1);
  // Flat ellipses (width ≤ 2): finish the tips.
  while (y0 - y1 <= b) {
    put(x0 - 1, y0);
    put(x1 + 1, y0++);
    put(x0 - 1, y1);
    put(x1 + 1, y1--);
  }
  return dedupe(out);
}

/** Interior pixels (row spans between the outline), outline excluded. */
export function ellipseFill(outline: [number, number][]): [number, number][] {
  const rows = new Map<number, [number, number]>();
  for (const [x, y] of outline) {
    const r = rows.get(y);
    if (!r) rows.set(y, [x, x]);
    else {
      if (x < r[0]) r[0] = x;
      if (x > r[1]) r[1] = x;
    }
  }
  const edge = new Set(outline.map(([x, y]) => x + ',' + y));
  const out: [number, number][] = [];
  for (const [y, [lo, hi]] of rows)
    for (let x = lo + 1; x < hi; x++) if (!edge.has(x + ',' + y)) out.push([x, y]);
  return out;
}

function dedupe(px: [number, number][]): [number, number][] {
  const seen = new Set<string>();
  return px.filter(([x, y]) => {
    const k = x + ',' + y;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
