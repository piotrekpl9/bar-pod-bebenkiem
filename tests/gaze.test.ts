import { describe, expect, it } from 'vitest';
import { fromCanonical, gazeChanged, sanitizeGaze, seatPosition, toCanonical, type Vec3 } from '../src/core/gaze';

const close = (a: Vec3, b: Vec3) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 6));

describe('przeliczanie spojrzenia między widokami', () => {
  it('punkt przechodzi przez układ kanoniczny bez zmian', () => {
    const p: Vec3 = [0.7, 1.2, -0.4];
    for (const n of [4, 6, 8]) for (let s = 0; s < n; s++) close(fromCanonical(toCanonical(p, s, n), s, n), p);
  });

  it('miejsce gracza X wygląda tak samo u wszystkich po przeliczeniu', () => {
    // gracz A (miejsce a) patrzy na głowę gracza X; gracz B (miejsce b) musi zobaczyć ten sam cel
    for (const n of [4, 6, 8]) {
      for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) for (let x = 0; x < n; x++) {
        const inA = seatPosition(x, a, n, 2);
        const inB = fromCanonical(toCanonical(inA, a, n), b, n);
        close(inB, seatPosition(x, b, n, 2));
      }
    }
  });

  it('własne miejsce jest zawsze na dole (z > 0)', () => {
    for (const n of [4, 6, 8]) for (let s = 0; s < n; s++) close(seatPosition(s, s, n, 2), [0, 0, 2]);
  });
});

describe('dane spojrzenia z sieci', () => {
  it('przepuszcza poprawne i zaokrągla punkty', () => {
    expect(sanitizeGaze({ at: 3 }, 4)).toEqual({ at: 3 });
    expect(sanitizeGaze({ p: [0.123, 1.456, -2.111] }, 4)).toEqual({ p: [0.12, 1.46, -2.11] });
  });
  it('odrzuca śmieci', () => {
    for (const bad of [null, 5, 'x', { at: 4 }, { at: -1 }, { at: 1.5 }, { p: [1, 2] }, { p: [1, 2, NaN] }, { p: [1, 2, 999] }, { p: ['a', 1, 2] }]) {
      expect(sanitizeGaze(bad, 4)).toBeNull();
    }
  });
  it('wysyła tylko zauważalne zmiany', () => {
    expect(gazeChanged(null, { at: 1 })).toBe(true);
    expect(gazeChanged({ at: 1 }, { at: 1 })).toBe(false);
    expect(gazeChanged({ at: 1 }, { at: 2 })).toBe(true);
    expect(gazeChanged({ at: 1 }, { p: [0, 0, 0] })).toBe(true);
    expect(gazeChanged({ p: [0, 1, 0] }, { p: [0.02, 1, 0] })).toBe(false);
    expect(gazeChanged({ p: [0, 1, 0] }, { p: [0.5, 1, 0] })).toBe(true);
  });
});
