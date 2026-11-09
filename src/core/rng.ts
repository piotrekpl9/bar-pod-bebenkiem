/** Funkcja losująca z przedziału [0, 1). W grze to Math.random, w testach ziarno. */
export type Rng = () => number;

/** Powtarzalny generator (mulberry32) do testów i symulacji. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const randInt = (rng: Rng, n: number): number => Math.floor(rng() * n);

/** Tasowanie Fishera–Yatesa w miejscu. */
export function shuffle<T>(arr: T[], rng: Rng): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export const pick = <T>(arr: readonly T[], rng: Rng): T => arr[randInt(rng, arr.length)];
