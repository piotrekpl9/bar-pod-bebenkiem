import { KINDS } from './constants';
import type { Kind } from './types';

/** Jak postać wygląda w menu. */
export const KIND_INFO: Record<Kind, { emoji: string; label: string }> = {
  frog: { emoji: '🐸', label: 'Żaba' },
  robot: { emoji: '🤖', label: 'Robot' },
  owl: { emoji: '🦉', label: 'Sowa' },
  mustache: { emoji: '🎩', label: 'Wąsacz' },
  bear: { emoji: '🐻', label: 'Miś' },
  cat: { emoji: '🐱', label: 'Kotka' },
  rabbit: { emoji: '🐰', label: 'Królik' },
  penguin: { emoji: '🐧', label: 'Pingwin' },
};

export const isKind = (k: unknown): k is Kind => typeof k === 'string' && (KINDS as readonly string[]).includes(k);

/** Postacie zajęte przy stole (każda postać może siedzieć tylko raz). Boty-wypełniacze się nie liczą. */
export const takenKinds = (seats: readonly ({ kind: Kind; isBot?: boolean; fill?: boolean } | null)[], except = -1): Set<Kind> =>
  new Set(seats.flatMap((s, i) => (s && i !== except && !(s.isBot && s.fill) ? [s.kind] : [])));

/** Wybrana postać, a jeśli zajęta – pierwsza wolna. */
export function freeKind(wanted: Kind | undefined, taken: ReadonlySet<Kind>): Kind {
  if (wanted && !taken.has(wanted)) return wanted;
  const free = KINDS.find(k => !taken.has(k));
  if (!free) throw new Error('Brak wolnych postaci');
  return free;
}
