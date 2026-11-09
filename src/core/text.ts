import { DECKS } from './constants';
import { deckSize } from './deck';
import type { Card, Kind, Mode, Rank, TableSize } from './types';

const NAMES: Record<Rank, [string, string, string]> = {
  K: ['król', 'króle', 'króle'], Q: ['dama', 'damy', 'damy'], A: ['as', 'asy', 'asy'],
};
const NUMS: Record<Rank, [string, string, string]> = {
  K: ['Jeden', 'Dwa', 'Trzy'], Q: ['Jedna', 'Dwie', 'Trzy'], A: ['Jeden', 'Dwa', 'Trzy'],
};
export const FULL: Record<Rank, string> = { K: 'KRÓLE', Q: 'DAMY', A: 'ASY' };

/** „Dwie damy.” – to, co gracz mówi przy zagraniu n kart. */
export const claimText = (t: Rank, n: number): string => `${NUMS[t][n - 1]} ${NAMES[t][n - 1]}.`;

const LABELS: Partial<Record<Card, string>> = { J: 'Joker', D: 'Diabeł', M: 'Lustro', X: 'Podwójny strzał' };
export const cardLabel = (c: Card): string => LABELS[c] ?? c;

export const SPECIAL_DESC: Partial<Record<Card, string>> = {
  J: 'Joker: pasuje do każdej karty stołu.',
  D: 'Diabeł: liczy się jak prawdziwa karta. Odkryty = strzelają wszyscy oprócz tego, kto go zagrał.',
  M: 'Lustro: liczy się jak prawdziwa karta. Odkryte = kara odbija się na oskarżyciela.',
  X: 'Podwójny strzał: zawsze jest kłamstwem. Odkryty = przegrany strzela dwa razy.',
};

export function deckDesc(size: TableSize, mode: Mode): string {
  const { per, jokers } = DECKS[size];
  const sp = mode === 'special';
  return `Talia (${deckSize(size, mode)}): ${per}×K · ${per}×Q · ${per}×A · ${jokers}×Joker` + (sp ? ' · Diabeł · Lustro · ×2' : '');
}

/** „4 osoby”, „6 osób”. */
export const people = (n: number): string => `${n} ${n >= 2 && n <= 4 ? 'osoby' : 'osób'}`;

/** „1 rundę”, „3 rundy”, „12 rund”. */
export function rounds(n: number): string {
  if (n === 1) return '1 rundę';
  const d = n % 10, dd = n % 100;
  return `${n} ${d >= 2 && d <= 4 && (dd < 12 || dd > 14) ? 'rundy' : 'rund'}`;
}

export const RELIEF: Record<Kind, string[]> = {
  frog: ['Kum kum… żyję!', 'Rechot ulgi.', 'Nie tym razem.'],
  robot: ['Bzzz… żyję.', 'Błąd 404: kula.', 'Obwody całe.'],
  owl: ['Huhu… pusto.', 'Nie dziś, kochani.', 'Uff!'],
  mustache: ['Ha! Szczęściarz!', 'Jeszcze nie teraz.', 'Wąs ocalał.'],
  bear: ['Mrrr… żyję.', 'Gruba skóra.', 'Phi!'],
  cat: ['Mam jeszcze osiem żyć.', 'Miau… pusto.', 'Fart.'],
  rabbit: ['Uszy w górę, żyję!', 'Kicam dalej.', 'Uff, marchewka czeka.'],
  penguin: ['Zimna krew.', 'Elegancko, pusto.', 'Nie tym razem, kochani.'],
};
