import { DECKS, HAND_SIZE, RANKS, SPECIAL_EXTRA } from './constants';
import { shuffle, type Rng } from './rng';
import type { Card, Mode, TableSize } from './types';

export function buildDeck(size: TableSize, mode: Mode): Card[] {
  const { per, jokers } = DECKS[size];
  const deck: Card[] = [];
  for (const r of RANKS) for (let k = 0; k < per; k++) deck.push(r);
  for (let k = 0; k < jokers; k++) deck.push('J');
  if (mode === 'special') deck.push(...SPECIAL_EXTRA);
  return deck;
}

export const deckSize = (size: TableSize, mode: Mode): number => buildDeck(size, mode).length;

/**
 * Ile kart w talii może „mówić prawdę” dla danej karty stołu:
 * figury tego typu + jokery (+ Diabeł i Lustro w trybie specjalnym).
 */
export function truthfulTotal(size: TableSize, mode: Mode): number {
  const { per, jokers } = DECKS[size];
  return per + jokers + (mode === 'special' ? 2 : 0);
}

/** Rozdaje po 5 kart żywym graczom. Zwraca ręce w kolejności miejsc (null = brak gracza / martwy). */
export function deal(size: TableSize, mode: Mode, alive: boolean[], rng: Rng): (Card[] | null)[] {
  const deck = shuffle(buildDeck(size, mode), rng);
  return alive.map(a => (a ? deck.splice(0, HAND_SIZE) : null));
}
