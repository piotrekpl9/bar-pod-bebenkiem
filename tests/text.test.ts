import { describe, expect, it } from 'vitest';
import { cardLabel, claimText, deckDesc, people, rounds } from '../src/core/text';

describe('teksty po polsku', () => {
  it('odmienia zgłoszenia', () => {
    expect(claimText('K', 1)).toBe('Jeden król.');
    expect(claimText('K', 2)).toBe('Dwa króle.');
    expect(claimText('Q', 2)).toBe('Dwie damy.');
    expect(claimText('Q', 1)).toBe('Jedna dama.');
    expect(claimText('A', 3)).toBe('Trzy asy.');
  });
  it('odmienia liczby osób i rund', () => {
    expect(people(4)).toBe('4 osoby');
    expect(people(6)).toBe('6 osób');
    expect(people(8)).toBe('8 osób');
    expect(rounds(1)).toBe('1 rundę');
    expect(rounds(3)).toBe('3 rundy');
    expect(rounds(5)).toBe('5 rund');
    expect(rounds(12)).toBe('12 rund');
    expect(rounds(22)).toBe('22 rundy');
  });
  it('nazywa specjalne karty i opisuje talię', () => {
    expect(cardLabel('D')).toBe('Diabeł');
    expect(cardLabel('K')).toBe('K');
    expect(deckDesc(8, 'classic')).toBe('Talia (40): 12×K · 12×Q · 12×A · 4×Joker');
    expect(deckDesc(4, 'special')).toBe('Talia (23): 6×K · 6×Q · 6×A · 2×Joker · Diabeł · Lustro · ×2');
  });
});
