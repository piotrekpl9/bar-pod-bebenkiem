import type { Kind, Rank, TableSize, Traits } from './types';

export const RANKS: readonly Rank[] = ['K', 'Q', 'A'];
export const HAND_SIZE = 5;
export const CHAMBERS = 6;
export const TABLE_SIZES: readonly TableSize[] = [4, 6, 8];

/** Skład talii: po `per` kart każdej figury i `jokers` jokerów. Zawsze 5 kart na gracza. */
export const DECKS: Record<TableSize, { per: number; jokers: number }> = {
  4: { per: 6, jokers: 2 },
  6: { per: 9, jokers: 3 },
  8: { per: 12, jokers: 4 },
};

/** Specjalne karty dokładane w trybie „Specjalne karty” (po jednej). */
export const SPECIAL_EXTRA = ['D', 'M', 'X'] as const;

export const TURN_MS: Record<TableSize, number> = { 4: 60000, 6: 45000, 8: 40000 };

/** Postać przypisana do miejsca przy stole (miejsce 0 = host). */
export const KINDS: readonly Kind[] = ['frog', 'robot', 'owl', 'mustache', 'bear', 'cat', 'rabbit', 'penguin'];

export const BOT_NAMES: Record<Kind, string> = {
  frog: 'Żaneta', robot: 'Zbychu', owl: 'Halina', mustache: 'Rysiek',
  bear: 'Bogdan', cat: 'Kasia', rabbit: 'Zenek', penguin: 'Gienia',
};

export const TRAITS: Record<Kind, Traits> = {
  frog: { bluff: 0.3, susp: 1.1 },
  robot: { bluff: 0.25, susp: 1.0 },
  owl: { bluff: 0.14, susp: 1.25 },
  mustache: { bluff: 0.42, susp: 0.85 },
  bear: { bluff: 0.2, susp: 0.95 },
  cat: { bluff: 0.35, susp: 1.15 },
  rabbit: { bluff: 0.33, susp: 0.9 },
  penguin: { bluff: 0.18, susp: 1.2 },
};

export const isTableSize = (n: unknown): n is TableSize => n === 4 || n === 6 || n === 8;
