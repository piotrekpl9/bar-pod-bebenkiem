// Spojrzenie gracza przesyłane innym: na kogo albo na jaki punkt patrzy.
// Każdy gracz widzi stół „ze swojego miejsca”, więc punkty przesyła się
// w układzie kanonicznym (miejsce 0 na dole) i każdy obraca je do swojego widoku.

/** Patrzy na gracza na miejscu `at` albo na punkt `p` (układ kanoniczny). */
export type Gaze = { at: number } | { p: [number, number, number] };

export type Vec3 = [number, number, number];

/** Obrót wokół osi pionowej (taki sam jak THREE.Vector3.applyAxisAngle(Y, a)). */
export function rotY([x, y, z]: Vec3, a: number): Vec3 {
  const c = Math.cos(a), s = Math.sin(a);
  return [x * c + z * s, y, -x * s + z * c];
}

const seatAngle = (seat: number, n: number) => (2 * Math.PI * seat) / n;

/** Punkt z widoku gracza na miejscu `mySeat` → układ kanoniczny. */
export const toCanonical = (p: Vec3, mySeat: number, n: number): Vec3 => rotY(p, -seatAngle(mySeat, n));
/** Punkt kanoniczny → widok gracza na miejscu `mySeat`. */
export const fromCanonical = (p: Vec3, mySeat: number, n: number): Vec3 => rotY(p, seatAngle(mySeat, n));

/** Pozycja miejsca w widoku gracza (ta sama formuła co w grafice). */
export function seatPosition(seat: number, mySeat: number, n: number, r: number): Vec3 {
  const a = (2 * Math.PI * ((seat - mySeat + n) % n)) / n;
  return [-r * Math.sin(a), 0, r * Math.cos(a)];
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Dane z sieci są niezaufane: przepuszcza tylko sensowne spojrzenie. */
export function sanitizeGaze(g: unknown, n: number): Gaze | null {
  if (!g || typeof g !== 'object') return null;
  const o = g as Record<string, unknown>;
  if ('at' in o) {
    const at = o.at;
    return Number.isInteger(at) && (at as number) >= 0 && (at as number) < n ? { at: at as number } : null;
  }
  if ('p' in o && Array.isArray(o.p) && o.p.length === 3 && o.p.every(v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 20)) {
    return { p: (o.p as number[]).map(round2) as Vec3 };
  }
  return null;
}

/** Czy spojrzenie zmieniło się na tyle, żeby warto je wysłać. */
export function gazeChanged(a: Gaze | null, b: Gaze): boolean {
  if (!a) return true;
  if ('at' in a || 'at' in b) return !('at' in a && 'at' in b && a.at === b.at);
  const [x, y, z] = a.p, [u, v, w] = b.p;
  return Math.hypot(x - u, y - v, z - w) > 0.08;
}
