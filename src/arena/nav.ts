// Siatka nawigacyjna dla bota: komórki 0,5 m, A* po 8 kierunkach.
// Bot chodzi po ziemi – podesty i skrzynie traktuje jak przeszkody.

import { BOUNDS, type Box } from './map';
import { RADIUS } from './physics';

export const CELL = 0.5;

export interface NavGrid { w: number; h: number; ox: number; oz: number; free: Uint8Array }

export function buildNav(boxes: readonly Box[]): NavGrid {
  const ox = -BOUNDS.x, oz = -BOUNDS.z;
  const w = Math.round((BOUNDS.x * 2) / CELL), h = Math.round((BOUNDS.z * 2) / CELL);
  const free = new Uint8Array(w * h).fill(1);
  const pad = RADIUS + 0.08;
  for (const b of boxes) {
    if (b.y0 > 1.9) continue; // wysoko nad głową (stropy, dachy)
    const i0 = Math.max(0, Math.floor((b.x0 - pad - ox) / CELL)), i1 = Math.min(w - 1, Math.floor((b.x1 + pad - ox) / CELL));
    const j0 = Math.max(0, Math.floor((b.z0 - pad - oz) / CELL)), j1 = Math.min(h - 1, Math.floor((b.z1 + pad - oz) / CELL));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      // komórka zablokowana, jeśli jej środek leży w poszerzonym pudełku
      const cx = ox + (i + 0.5) * CELL, cz = oz + (j + 0.5) * CELL;
      if (cx > b.x0 - pad && cx < b.x1 + pad && cz > b.z0 - pad && cz < b.z1 + pad) free[j * w + i] = 0;
    }
  }
  return { w, h, ox, oz, free };
}

export const cellOf = (g: NavGrid, x: number, z: number): [number, number] =>
  [Math.max(0, Math.min(g.w - 1, Math.floor((x - g.ox) / CELL))), Math.max(0, Math.min(g.h - 1, Math.floor((z - g.oz) / CELL)))];
export const cellCenter = (g: NavGrid, i: number, j: number): [number, number] => [g.ox + (i + 0.5) * CELL, g.oz + (j + 0.5) * CELL];
export const isFree = (g: NavGrid, i: number, j: number): boolean => i >= 0 && j >= 0 && i < g.w && j < g.h && g.free[j * g.w + i] === 1;

/** Najbliższa wolna komórka (gdy cel stoi np. na skrzyni). */
export function nearestFree(g: NavGrid, i: number, j: number): [number, number] | null {
  if (isFree(g, i, j)) return [i, j];
  for (let r = 1; r < 12; r++) {
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      if (isFree(g, i + di, j + dj)) return [i + di, j + dj];
    }
  }
  return null;
}

/** Ścieżka z (x,z) do (tx,tz) jako lista punktów w metrach (bez punktu startowego). */
export function findPath(g: NavGrid, x: number, z: number, tx: number, tz: number): [number, number][] | null {
  const s = nearestFree(g, ...cellOf(g, x, z)), t = nearestFree(g, ...cellOf(g, tx, tz));
  if (!s || !t) return null;
  const N = g.w * g.h, si = s[1] * g.w + s[0], ti = t[1] * g.w + t[0];
  const gs = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
  const heur = (k: number) => { const i = k % g.w, j = (k / g.w) | 0; const dx = Math.abs(i - t[0]), dz = Math.abs(j - t[1]); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
  // prosta kopiec binarny
  const heap: number[] = [], f = new Float32Array(N);
  const push = (k: number) => { heap.push(k); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (f[heap[p]] <= f[heap[c]]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
  const pop = () => { const top = heap[0], last = heap.pop()!; if (heap.length) { heap[0] = last; let c = 0; for (;;) { const l = c * 2 + 1, r = l + 1; let m = c; if (l < heap.length && f[heap[l]] < f[heap[m]]) m = l; if (r < heap.length && f[heap[r]] < f[heap[m]]) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } } return top; };
  gs[si] = 0; f[si] = heur(si); push(si);
  while (heap.length) {
    const k = pop();
    if (closed[k]) continue;
    if (k === ti) break;
    closed[k] = 1;
    const i = k % g.w, j = (k / g.w) | 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ni = i + di, nj = j + dj;
      if (!isFree(g, ni, nj)) continue;
      if (di && dj && (!isFree(g, i + di, j) || !isFree(g, i, j + dj))) continue; // bez ścinania rogów
      const nk = nj * g.w + ni, cost = gs[k] + (di && dj ? 1.414 : 1);
      if (cost < gs[nk]) { gs[nk] = cost; from[nk] = k; f[nk] = cost + heur(nk); push(nk); }
    }
  }
  if (from[ti] < 0 && si !== ti) return null;
  const cells: number[] = [];
  for (let k = ti; k !== si && k >= 0; k = from[k]) cells.push(k);
  cells.reverse();
  // wygładzanie: pomijamy punkty, do których da się iść prosto
  const pts = cells.map(k => cellCenter(g, k % g.w, (k / g.w) | 0));
  const out: [number, number][] = [];
  let ax = x, az = z;
  for (let n = 0; n < pts.length; n++) {
    const next = pts[n + 1];
    if (next && walkable(g, ax, az, next[0], next[1])) continue;
    out.push(pts[n]); [ax, az] = pts[n];
  }
  return out;
}

/** Czy da się przejść prosto (próbkujemy co ćwierć komórki). */
export function walkable(g: NavGrid, x0: number, z0: number, x1: number, z1: number): boolean {
  const d = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(d / (CELL * 0.25));
  for (let k = 0; k <= n; k++) {
    const t = n ? k / n : 0;
    const [i, j] = cellOf(g, x0 + (x1 - x0) * t, z0 + (z1 - z0) * t);
    if (!isFree(g, i, j)) return false;
  }
  return true;
}
