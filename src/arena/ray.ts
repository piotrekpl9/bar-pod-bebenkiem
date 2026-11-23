// Promienie: strzały (hitscan), linia wzroku bota i trafienia w gracza.

import type { Box } from './map';
import { RADIUS, STAND_H } from './physics';

export type V3 = [number, number, number];

/** Przecięcie promienia z prostopadłościanem (metoda płyt). Zwraca odległość albo Infinity. */
export function rayBox(o: V3, d: V3, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): number {
  let tmin = 0, tmax = Infinity;
  const lo = [x0, y0, z0], hi = [x1, y1, z1];
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-9) {
      if (o[a] < lo[a] || o[a] > hi[a]) return Infinity;
      continue;
    }
    let t1 = (lo[a] - o[a]) / d[a], t2 = (hi[a] - o[a]) / d[a];
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return Infinity;
  }
  return tmin;
}

export interface MapHit { t: number; box: Box | null; normal: V3 }

/** Najbliższe trafienie w mapę (pudełka albo ziemię). */
export function rayMap(o: V3, d: V3, maxT: number, boxes: readonly Box[]): MapHit | null {
  let best: MapHit | null = null;
  let bestT = maxT;
  if (d[1] < -1e-9) { // ziemia y = 0
    const t = -o[1] / d[1];
    if (t >= 0 && t < bestT) { bestT = t; best = { t, box: null, normal: [0, 1, 0] }; }
  }
  for (const b of boxes) {
    const t = rayBox(o, d, b.x0, b.y0, b.z0, b.x1, b.y1, b.z1);
    if (t < bestT) { bestT = t; best = { t, box: b, normal: [0, 0, 0] }; }
  }
  if (best?.box) best.normal = boxNormal(best.box, [o[0] + d[0] * best.t, o[1] + d[1] * best.t, o[2] + d[2] * best.t]);
  return best;
}

function boxNormal(b: Box, p: V3): V3 {
  const c: [number, V3][] = [
    [Math.abs(p[0] - b.x0), [-1, 0, 0]], [Math.abs(p[0] - b.x1), [1, 0, 0]],
    [Math.abs(p[1] - b.y0), [0, -1, 0]], [Math.abs(p[1] - b.y1), [0, 1, 0]],
    [Math.abs(p[2] - b.z0), [0, 0, -1]], [Math.abs(p[2] - b.z1), [0, 0, 1]],
  ];
  c.sort((a, b2) => a[0] - b2[0]);
  return c[0][1];
}

/** Czy odcinek a→b jest wolny od ścian. */
export function clearLine(a: V3, b: V3, boxes: readonly Box[]): boolean {
  const d: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(d[0], d[1], d[2]);
  if (len < 1e-6) return true;
  d[0] /= len; d[1] /= len; d[2] /= len;
  return !rayMap(a, d, len, boxes);
}

/** Strefy trafienia gracza stojącego stopami w (x, y, z). */
export interface Target { x: number; y: number; z: number; crouch: boolean }
export const HEAD = 0.17; // pół boku sześcianu głowy

export function headCenter(t: Target): V3 {
  const h = t.crouch ? 1.25 : STAND_H;
  return [t.x, t.y + h - HEAD - 0.02, t.z];
}

/** Trafienie w gracza: głowa ma pierwszeństwo, gdy obie strefy są równie blisko. */
export function rayPlayer(o: V3, d: V3, t: Target, maxT: number): { t: number; head: boolean } | null {
  const hc = headCenter(t);
  const th = rayBox(o, d, hc[0] - HEAD, hc[1] - HEAD, hc[2] - HEAD, hc[0] + HEAD, hc[1] + HEAD, hc[2] + HEAD);
  const r = RADIUS * 0.9;
  const tb = rayBox(o, d, t.x - r, t.y, t.z - r, t.x + r, hc[1] - HEAD, t.z + r);
  const best = Math.min(th, tb);
  if (best >= maxT || best === Infinity) return null;
  return { t: best, head: th <= tb + 1e-6 };
}
