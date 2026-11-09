import { describe, expect, it } from 'vitest';
import { buildDeck, deal, deckSize, truthfulTotal } from '../src/core/deck';
import { seededRng } from '../src/core/rng';
import type { Card, Mode, TableSize } from '../src/core/types';

const count = (deck: Card[], c: Card) => deck.filter(x => x === c).length;

describe('talia', () => {
  it.each([
    [4, 6, 2, 20],
    [6, 9, 3, 30],
    [8, 12, 4, 40],
  ] as const)('stół na %i: po %i figur, %i jokery, razem %i', (size, per, jokers, total) => {
    const deck = buildDeck(size, 'classic');
    expect(deck).toHaveLength(total);
    for (const r of ['K', 'Q', 'A'] as const) expect(count(deck, r)).toBe(per);
    expect(count(deck, 'J')).toBe(jokers);
    expect(deck.some(c => c === 'D' || c === 'M' || c === 'X')).toBe(false);
  });

  it('wystarcza dokładnie na 5 kart dla każdego w trybie klasycznym', () => {
    for (const size of [4, 6, 8] as TableSize[]) expect(deckSize(size, 'classic')).toBe(size * 5);
  });

  it('tryb specjalny dokłada po jednym Diable, Lustrze i Podwójnym strzale', () => {
    for (const size of [4, 6, 8] as TableSize[]) {
      const deck = buildDeck(size, 'special');
      expect(deck).toHaveLength(size * 5 + 3);
      expect(count(deck, 'D')).toBe(1);
      expect(count(deck, 'M')).toBe(1);
      expect(count(deck, 'X')).toBe(1);
    }
  });

  it('liczy karty, które mogą mówić prawdę', () => {
    expect(truthfulTotal(4, 'classic')).toBe(8);
    expect(truthfulTotal(6, 'classic')).toBe(12);
    expect(truthfulTotal(8, 'classic')).toBe(16);
    expect(truthfulTotal(4, 'special')).toBe(10);
  });

  it('proporcja kart prawdziwych jest taka sama przy każdym stole (40%)', () => {
    for (const size of [4, 6, 8] as TableSize[]) expect(truthfulTotal(size, 'classic') / deckSize(size, 'classic')).toBeCloseTo(0.4);
  });
});

describe('rozdanie', () => {
  it('daje po 5 kart tylko żywym i nie dubluje kart', () => {
    const rng = seededRng(1);
    for (const mode of ['classic', 'special'] as Mode[]) {
      const alive = [true, false, true, true, false, true];
      const hands = deal(6, mode, alive, rng);
      hands.forEach((h, i) => (alive[i] ? expect(h).toHaveLength(5) : expect(h).toBeNull()));
      const all = hands.flatMap(h => h ?? []);
      const deck = buildDeck(6, mode);
      for (const c of new Set(all)) expect(count(all, c)).toBeLessThanOrEqual(count(deck, c));
    }
  });

  it('jest powtarzalne dla tego samego ziarna', () => {
    expect(deal(4, 'classic', [true, true, true, true], seededRng(7)))
      .toEqual(deal(4, 'classic', [true, true, true, true], seededRng(7)));
  });
});
