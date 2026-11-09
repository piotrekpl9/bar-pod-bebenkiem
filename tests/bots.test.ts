import { describe, expect, it } from 'vitest';
import { chooseBotPlay, shouldBotChallenge, type ChallengeContext } from '../src/core/bots';
import { TRAITS } from '../src/core/constants';
import { buildDeck } from '../src/core/deck';
import { seededRng, shuffle } from '../src/core/rng';
import { isTruthful, isValidPlay } from '../src/core/rules';
import type { Card } from '../src/core/types';

describe('bot zagrywa', () => {
  it('zawsze wybiera 1–3 poprawne karty (10 000 losowych rąk)', () => {
    const rng = seededRng(42);
    for (let i = 0; i < 10000; i++) {
      const hand = shuffle(buildDeck(6, 'special'), rng).slice(0, 1 + Math.floor(rng() * 5));
      const play = chooseBotPlay(hand, 'K', TRAITS.mustache, rng);
      expect(isValidPlay(play, hand.length)).toBe(true);
    }
  });

  it('bez prawdziwych kart musi blefować', () => {
    const hand: Card[] = ['Q', 'A', 'X'];
    const play = chooseBotPlay(hand, 'K', TRAITS.owl, seededRng(3));
    expect(play.every(i => !isTruthful(hand[i], 'K'))).toBe(true);
  });

  it('mając same prawdziwe karty, gra prawdę i chętnie się ich pozbywa', () => {
    const hand: Card[] = ['K', 'K', 'J', 'K'];
    const play = chooseBotPlay(hand, 'K', TRAITS.owl, seededRng(5));
    expect(play).toHaveLength(3);
    expect(play.every(i => isTruthful(hand[i], 'K'))).toBe(true);
  });

  it('najpierw gra zwykłe figury, jokery i specjalne zostawia', () => {
    const hand: Card[] = ['J', 'D', 'K', 'Q'];
    const rng = seededRng(11);
    for (let i = 0; i < 200; i++) {
      const play = chooseBotPlay(hand, 'K', { bluff: 0, susp: 1 }, rng);
      if (play.length === 1) expect(hand[play[0]]).toBe('K');
    }
  });
});

describe('bot sprawdza', () => {
  const base = (over: Partial<ChallengeContext> = {}): ChallengeContext => ({
    seat: 0, hand: ['Q', 'A'], table: 'K', traits: TRAITS.robot,
    plays: [], lastPlay: { seat: 3, cards: ['K'] }, lastPlayerHandSize: 4, shots: 0, truthfulTotal: 8, ...over,
  });

  it('zawsze sprawdza, gdy zgłoszeń jest więcej, niż może istnieć', () => {
    const plays = [{ seat: 1, cards: ['K', 'K', 'K'] as Card[] }, { seat: 2, cards: ['K', 'K', 'K'] as Card[] }, { seat: 3, cards: ['K', 'K'] as Card[] }];
    const ctx = base({ hand: ['K'], plays, lastPlay: plays[2] });
    const rng = seededRng(1);
    for (let i = 0; i < 50; i++) expect(shouldBotChallenge(ctx, rng)).toBe(true);
  });

  it('przy jednej karcie na początku rundy zwykle wierzy', () => {
    const rng = seededRng(9);
    let calls = 0;
    for (let i = 0; i < 1000; i++) if (shouldBotChallenge(base({ hand: ['K', 'K', 'J'], plays: [{ seat: 3, cards: ['K'] }] }), rng)) calls++;
    expect(calls).toBeLessThan(200);
  });

  it('podejrzliwa sowa sprawdza częściej niż wyluzowany Rysiek', () => {
    const rng = seededRng(4);
    const rate = (traits = TRAITS.owl) => {
      let c = 0;
      for (let i = 0; i < 4000; i++) if (shouldBotChallenge(base({ traits, lastPlay: { seat: 3, cards: ['K', 'K'] }, plays: [{ seat: 3, cards: ['K', 'K'] }] }), rng)) c++;
      return c;
    };
    expect(rate(TRAITS.owl)).toBeGreaterThan(rate(TRAITS.mustache));
  });
});
