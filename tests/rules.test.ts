import { describe, expect, it } from 'vitest';
import { isTruthful, isValidPlay, pullTrigger, resolveChallenge, takeCards, turnStatus } from '../src/core/rules';
import type { Card } from '../src/core/types';

const all4 = [true, true, true, true];

describe('prawda czy kłamstwo', () => {
  it('karta stołu, joker, Diabeł i Lustro mówią prawdę', () => {
    for (const c of ['K', 'J', 'D', 'M'] as Card[]) expect(isTruthful(c, 'K')).toBe(true);
  });
  it('inne figury i Podwójny strzał kłamią', () => {
    for (const c of ['Q', 'A', 'X'] as Card[]) expect(isTruthful(c, 'K')).toBe(false);
  });
});

describe('KŁAMCA! – zwykłe karty', () => {
  it('prawda: strzela oskarżyciel', () => {
    const r = resolveChallenge({ cards: ['K', 'J'], table: 'K', challenger: 2, player: 1, alive: all4 });
    expect(r).toMatchObject({ truthful: true, effect: null, double: false, shooters: [2], nextStarter: 2 });
  });
  it('kłamstwo: strzela ten, kto zagrał', () => {
    const r = resolveChallenge({ cards: ['K', 'Q'], table: 'K', challenger: 2, player: 1, alive: all4 });
    expect(r).toMatchObject({ truthful: false, effect: null, shooters: [1], nextStarter: 1 });
  });
});

describe('KŁAMCA! – specjalne karty', () => {
  it('Diabeł: strzelają wszyscy żywi oprócz zagrywającego, po kolei od następnego', () => {
    const r = resolveChallenge({ cards: ['D'], table: 'A', challenger: 3, player: 2, alive: [true, true, true, true, false, true] });
    expect(r.effect).toBe('devil');
    expect(r.shooters).toEqual([3, 5, 0, 1]);
    expect(r.nextStarter).toBe(2);
  });
  it('Diabeł działa nawet z kłamstwem obok', () => {
    const r = resolveChallenge({ cards: ['Q', 'D'], table: 'A', challenger: 1, player: 0, alive: all4 });
    expect(r.truthful).toBe(false);
    expect(r.shooters).toEqual([1, 2, 3]);
  });
  it('Lustro: kara odbija się na oskarżyciela, nawet gdy reszta to kłamstwo', () => {
    const r = resolveChallenge({ cards: ['M', 'Q', 'A'], table: 'K', challenger: 3, player: 2, alive: all4 });
    expect(r).toMatchObject({ truthful: false, effect: 'mirror', shooters: [3], nextStarter: 3 });
  });
  it('Diabeł ma pierwszeństwo przed Lustrem', () => {
    const r = resolveChallenge({ cards: ['M', 'D'], table: 'K', challenger: 1, player: 0, alive: all4 });
    expect(r.effect).toBe('devil');
  });
  it('Podwójny strzał to zawsze kłamstwo i podwaja strzał', () => {
    const r = resolveChallenge({ cards: ['K', 'X'], table: 'K', challenger: 1, player: 0, alive: all4 });
    expect(r).toMatchObject({ truthful: false, double: true, shooters: [0] });
  });
  it('Podwójny strzał łączy się z Lustrem', () => {
    const r = resolveChallenge({ cards: ['M', 'X'], table: 'K', challenger: 1, player: 0, alive: all4 });
    expect(r).toMatchObject({ effect: 'mirror', double: true, shooters: [1] });
  });
});

describe('rewolwer', () => {
  it('strzela dokładnie w komorze z nabojem, a szansa rośnie', () => {
    for (let bullet = 0; bullet < 6; bullet++) {
      const r = { shots: 0, bullet };
      const dens: number[] = [];
      let deadAt = -1;
      for (let k = 0; k < 6 && deadAt < 0; k++) {
        const { dead, den } = pullTrigger(r);
        dens.push(den);
        if (dead) deadAt = k;
      }
      expect(deadAt).toBe(bullet);
      expect(dens).toEqual([6, 5, 4, 3, 2, 1].slice(0, bullet + 1));
    }
  });
});

describe('kolejka', () => {
  const lp = { seat: 1, cards: ['K'] as Card[] };
  it('gracz z kartami gra; sprawdzić może tylko nie-autor ostatniego zagrania', () => {
    expect(turnStatus(2, all4, [5, 4, 5, 5], lp)).toEqual({ kind: 'turn', canChallenge: true, forced: false });
    expect(turnStatus(1, all4, [5, 4, 5, 5], lp)).toEqual({ kind: 'turn', canChallenge: false, forced: false });
    expect(turnStatus(0, all4, [5, 5, 5, 5], null)).toEqual({ kind: 'turn', canChallenge: false, forced: false });
  });
  it('martwy gracz jest pomijany', () => {
    expect(turnStatus(2, [true, true, false, true], [5, 4, 5, 5], lp)).toEqual({ kind: 'skip' });
  });
  it('gracz bez kart jest pomijany, dopóki ktoś inny ma karty', () => {
    expect(turnStatus(2, all4, [5, 4, 0, 5], lp)).toEqual({ kind: 'skip' });
  });
  it('gdy poza autorem zagrania nikt nie ma kart, pierwszy następny musi sprawdzić', () => {
    expect(turnStatus(2, all4, [0, 3, 0, 0], lp)).toEqual({ kind: 'turn', canChallenge: true, forced: true });
    expect(turnStatus(2, all4, [0, 0, 0, 0], lp)).toEqual({ kind: 'turn', canChallenge: true, forced: true });
  });
});

describe('zagranie', () => {
  it('akceptuje 1–3 różne indeksy z zakresu ręki', () => {
    expect(isValidPlay([0], 5)).toBe(true);
    expect(isValidPlay([4, 0, 2], 5)).toBe(true);
    for (const bad of [[], [0, 1, 2, 3], [1, 1], [5], [-1], [1.5], 'x', null]) expect(isValidPlay(bad, 5)).toBe(false);
  });
  it('zabiera wskazane karty z ręki', () => {
    const hand: Card[] = ['K', 'Q', 'A', 'J', 'K'];
    expect(takeCards(hand, [3, 0])).toEqual(['K', 'J']);
    expect(hand).toEqual(['Q', 'A', 'K']);
  });
});
