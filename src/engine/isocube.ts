/**
 * Isometric (2:1) box geometry.
 *
 * Axes in pixels:  X = (2, 1) ↘,  Y = (−2, 1) ↙,  Z = (0, −1) ↑.
 * A box is corner(i, j, k) = O + i·a·X + j·b·Y + k·h·Z  for i, j, k ∈ {0, 1}.
 * `a`, `b` count 2:1 steps (each 2 px wide, 1 px tall); `h` counts pixels.
 *
 * With X and Y pointing down the screen, larger i/j is closer to the viewer, so
 * the front (visible) faces are i = 1, j = 1 and the top k = 1; the back faces
 * are i = 0, j = 0 and the bottom k = 0.
 */

export type IsoFace = 'auto' | 'top' | 'left' | 'right';
export type IsoEdges = 'all' | 'front' | 'back';
/** Plane of the first face: top (X×Y), right (X×Z) or left (Y×Z). */
export type IsoPlane = 'xy' | 'xz' | 'yz';

export interface Box {
  ox: number;
  oy: number;
  a: number;
  b: number;
  h: number;
}

const PLANE: Record<Exclude<IsoFace, 'auto'>, IsoPlane> = { top: 'xy', right: 'xz', left: 'yz' };

/** Plane for the first face, from the setting or (auto) from the drag direction. */
export function pickPlane(dx: number, dy: number, face: IsoFace): IsoPlane {
  if (face !== 'auto') return PLANE[face];
  // Shallow drag → top rhombus; steep drag → a side face, chosen by its slope.
  if (Math.abs(dy) <= Math.abs(dx) / 2) return 'xy';
  return dx * dy >= 0 ? 'xz' : 'yz';
}

/** First face: a flat box from the drag start (ox, oy) by (dx, dy) pixels. */
export function faceBox(ox: number, oy: number, dx: number, dy: number, plane: IsoPlane): Box {
  const r = Math.round;
  switch (plane) {
    case 'xy': // dx = 2a − 2b, dy = a + b
      return { ox, oy, a: r((dy + dx / 2) / 2), b: r((dy - dx / 2) / 2), h: 0 };
    case 'xz': {
      // dx = 2a, dy = a − h
      const a = r(dx / 2);
      return { ox, oy, a, b: 0, h: a - dy };
    }
    case 'yz': {
      // dx = −2b, dy = b − h
      const b = r(-dx / 2);
      return { ox, oy, a: 0, b, h: b - dy };
    }
  }
}

/** Second step: extrude the face along the remaining axis by a drag of (dx, dy) pixels. */
export function extrude(face: Box, plane: IsoPlane, dx: number, dy: number): Box {
  const r = Math.round;
  switch (plane) {
    case 'xy':
      return { ...face, h: -dy };
    case 'xz': // project onto Y = (−2, 1)
      return { ...face, b: r((-2 * dx + dy) / 5) };
    case 'yz': // project onto X = (2, 1)
      return { ...face, a: r((2 * dx + dy) / 5) };
  }
}

/** Same box with non-negative extents (moving the origin as needed). */
function normalize(bx: Box): Box {
  let { ox, oy, a, b, h } = bx;
  if (a < 0) { ox += 2 * a; oy += a; a = -a; }
  if (b < 0) { ox -= 2 * b; oy += b; b = -b; }
  if (h < 0) { oy -= h; h = -h; }
  return { ox, oy, a, b, h };
}

/**
 * Pixels of the box edges, per the edge filter.
 *
 * Pixel-art convention: every corner is a 2-pixel run (anchor + the pixel to its
 * right) shared by the edges meeting there, and 2:1 edges are runs of 2 from
 * corner to corner — so there are no single pixels or 3-pixel runs anywhere.
 * Vertical edges hang from the outer pixel of the leftmost/rightmost corners and
 * from both pixels of the middle (front/back) corners, keeping the box symmetric.
 */
export function boxPixels(box: Box, edges: IsoEdges): [number, number][] {
  const { ox, oy, a, b, h } = normalize(box);
  const corner = (i: number, j: number, k: number): [number, number] => [
    ox + 2 * a * i - 2 * b * j,
    oy + a * i + b * j - h * k,
  ];
  const show = (front: boolean, back: boolean) =>
    edges === 'all' || (edges === 'front' ? front : back);

  // Leftmost / rightmost corner columns (flat faces have coinciding corners).
  const minX = ox - 2 * b, maxX = ox + 2 * a;
  const out: [number, number][] = [];
  const run = (x: number, y: number) => out.push([x, y], [x + 1, y]);

  for (let j = 0; j <= 1; j++)
    for (let k = 0; k <= 1; k++) {
      // X edges: (0,j,k) → (1,j,k), one run per row going ↘.
      if (!show(j === 1 || k === 1, j === 0 || k === 0)) continue;
      const [x, y] = corner(0, j, k);
      for (let s = 0; s <= a; s++) run(x + 2 * s, y + s);
    }
  for (let i = 0; i <= 1; i++)
    for (let k = 0; k <= 1; k++) {
      // Y edges: (i,0,k) → (i,1,k), one run per row going ↙.
      if (!show(i === 1 || k === 1, i === 0 || k === 0)) continue;
      const [x, y] = corner(i, 0, k);
      for (let s = 0; s <= b; s++) run(x - 2 * s, y + s);
    }
  for (let i = 0; i <= 1; i++)
    for (let j = 0; j <= 1; j++) {
      // Vertical edges; which pixel(s) of the corner run they hang from.
      if (!show(i === 1 || j === 1, i === 0 || j === 0)) continue;
      const [x, y] = corner(i, j, 0);
      const cols = x === minX ? [x] : x === maxX ? [x + 1] : [x, x + 1];
      for (const cx of cols) for (let s = 0; s <= h; s++) out.push([cx, y - s]);
    }
  return out;
}
