// Przebieg meczu 1v1: rundy do 5 wygranych. Rozstrzyga zawsze strona 0 (wyzywający),
// druga strona tylko odtwarza to, co dostanie – dzięki temu obie widzą ten sam wynik.

export const WIN_ROUNDS = 5;
export const FREEZE_S = 3, ROUND_S = 100, END_S = 3.5;

export type Side = 0 | 1;
export type Phase = 'freeze' | 'live' | 'end' | 'over';

export interface MatchState {
  round: number;
  score: [number, number];
  phase: Phase;
  /** kiedy (s, zegar lokalny) kończy się bieżąca faza */
  until: number;
  /** zwycięzca ostatniej rundy (−1 = remis) */
  last: Side | -1;
  /** jak skończyła się ostatnia runda */
  how: 'kill' | 'time' | 'quit' | '';
}

export const newMatch = (now: number): MatchState => ({ round: 1, score: [0, 0], phase: 'freeze', until: now + FREEZE_S, last: -1, how: '' });

/** Koniec rundy (tylko gdy trwa). Zwraca nowy stan albo null, gdy nic się nie zmieniło. */
export function endRound(m: MatchState, winner: Side | -1, how: MatchState['how'], now: number): MatchState | null {
  if (m.phase !== 'live' && !(how === 'quit' && m.phase !== 'over')) return null;
  const score: [number, number] = [m.score[0], m.score[1]];
  if (winner >= 0) score[winner as Side]++;
  if (how === 'quit' && winner >= 0) score[winner as Side] = Math.max(score[winner as Side], WIN_ROUNDS);
  const over = score[0] >= WIN_ROUNDS || score[1] >= WIN_ROUNDS;
  return { ...m, score, phase: over ? 'over' : 'end', until: now + END_S, last: winner, how };
}

/** Upływ czasu. `hp` – zdrowie obu stron, potrzebne przy końcu czasu. */
export function tickMatch(m: MatchState, now: number, hp: [number, number]): MatchState | null {
  if (now < m.until) return null;
  if (m.phase === 'freeze') return { ...m, phase: 'live', until: now + ROUND_S };
  if (m.phase === 'live') {
    // czas minął: rundę bierze ten, kto ma więcej zdrowia
    const w: Side | -1 = hp[0] > hp[1] ? 0 : hp[1] > hp[0] ? 1 : -1;
    return endRound(m, w, 'time', now);
  }
  if (m.phase === 'end') return { ...m, round: m.round + 1, phase: 'freeze', until: now + FREEZE_S, how: '' };
  return null;
}

export const matchWinner = (m: MatchState): Side | -1 => (m.score[0] >= WIN_ROUNDS ? 0 : m.score[1] >= WIN_ROUNDS ? 1 : -1);
