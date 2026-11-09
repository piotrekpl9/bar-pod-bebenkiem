import { CHAMBERS } from './constants';
import type { Card, Effect, Play, Rank } from './types';

/** Czy karta „mówi prawdę” przy danej karcie stołu. Podwójny strzał (X) zawsze kłamie. */
export const isTruthful = (card: Card, table: Rank): boolean =>
  card === table || card === 'J' || card === 'D' || card === 'M';

export interface ChallengeInput {
  /** karty z ostatniego zagrania */
  cards: Card[];
  table: Rank;
  /** kto krzyknął KŁAMCA */
  challenger: number;
  /** kto zagrał karty */
  player: number;
  /** kto żyje, indeks = miejsce */
  alive: boolean[];
}

export interface ChallengeResult {
  truthful: boolean;
  effect: Effect;
  /** Podwójny strzał: każdy strzelający strzela dwa razy */
  double: boolean;
  /** kto pociąga za spust, w tej kolejności */
  shooters: number[];
  /** kto zaczyna następną rundę */
  nextStarter: number;
}

/**
 * Rozstrzyga „KŁAMCA!”.
 * Kolejność ważności: Diabeł > Lustro > zwykła prawda/kłamstwo. Podwójny strzał działa niezależnie.
 */
export function resolveChallenge({ cards, table, challenger, player, alive }: ChallengeInput): ChallengeResult {
  const truthful = cards.every(c => isTruthful(c, table));
  const double = cards.includes('X');
  const n = alive.length;
  if (cards.includes('D')) {
    const shooters: number[] = [];
    for (let k = 1; k < n; k++) {
      const j = (player + k) % n;
      if (alive[j]) shooters.push(j);
    }
    return { truthful, effect: 'devil', double, shooters, nextStarter: player };
  }
  if (cards.includes('M')) {
    return { truthful, effect: 'mirror', double, shooters: [challenger], nextStarter: challenger };
  }
  const loser = truthful ? challenger : player;
  return { truthful, effect: null, double, shooters: [loser], nextStarter: loser };
}

/** Rewolwer: nabój w komorze `bullet` (0–5), `shots` = ile razy już strzelano. */
export interface Revolver {
  shots: number;
  bullet: number;
}

/** Pociąga za spust. Zwraca, czy padł strzał, i mianownik szansy przed strzałem (1/den). */
export function pullTrigger(r: Revolver): { dead: boolean; den: number } {
  const den = CHAMBERS - r.shots;
  const dead = r.shots === r.bullet;
  r.shots++;
  return { dead, den };
}

export type TurnStatus =
  | { kind: 'skip' }
  | { kind: 'turn'; canChallenge: boolean; forced: boolean };

/**
 * Co robi gracz na miejscu `seat`, gdy przychodzi jego kolej.
 * Gracz bez kart jest pomijany, chyba że nikt poza autorem ostatniego zagrania
 * nie ma już kart. Wtedy musi sprawdzić (forced).
 */
export function turnStatus(seat: number, alive: boolean[], handSizes: number[], lastPlay: Play | null): TurnStatus {
  if (!alive[seat]) return { kind: 'skip' };
  const lp = lastPlay;
  if (handSizes[seat] === 0) {
    const othersHaveCards = !!lp && alive.some((a, k) => a && k !== lp.seat && handSizes[k] > 0);
    if (lp && seat !== lp.seat && !othersHaveCards) return { kind: 'turn', canChallenge: true, forced: true };
    return { kind: 'skip' };
  }
  return { kind: 'turn', canChallenge: !!lp && lp.seat !== seat, forced: false };
}

/** Sprawdza indeksy kart wybrane przez gracza (1–3 różne, w zakresie ręki). */
export function isValidPlay(idx: unknown, handSize: number): idx is number[] {
  if (!Array.isArray(idx) || idx.length < 1 || idx.length > 3) return false;
  if (new Set(idx).size !== idx.length) return false;
  return idx.every(x => Number.isInteger(x) && x >= 0 && x < handSize);
}

/** Usuwa wskazane karty z ręki (mutuje) i zwraca je w kolejności z ręki. */
export function takeCards(hand: Card[], idx: number[]): Card[] {
  return idx.slice().sort((a, b) => b - a).map(k => hand.splice(k, 1)[0]).reverse();
}
