import { isTruthful } from './rules';
import { shuffle, type Rng } from './rng';
import type { Card, Play, Rank, Traits } from './types';

/** Które karty bot zagrywa (indeksy w ręce, 1–3 sztuki). Ręka nie może być pusta. */
export function chooseBotPlay(hand: Card[], table: Rank, traits: Traits, rng: Rng): number[] {
  const truth: number[] = [], lies: number[] = [];
  hand.forEach((c, k) => (isTruthful(c, table) ? truth : lies).push(k));
  const lie = truth.length === 0 || (lies.length > 0 && rng() < traits.bluff);
  if (!lie) {
    // najpierw zwykłe figury, specjalne i jokery zostaw na później
    truth.sort((a, b) => Number(hand[a] !== table) - Number(hand[b] !== table));
    let n = rng() < 0.5 ? 1 : rng() < 0.75 ? 2 : 3;
    if (lies.length === 0) n = 3;
    return truth.slice(0, Math.min(n, truth.length));
  }
  const n = Math.min(lies.length, rng() < 0.65 ? 1 : 2);
  const picked = shuffle(lies.slice(), rng).slice(0, n);
  if (truth.length && picked.length < 3 && rng() < 0.3) picked.push(truth[0]);
  return picked;
}

export interface ChallengeContext {
  seat: number;
  hand: Card[];
  table: Rank;
  traits: Traits;
  /** zagrania z tej rundy */
  plays: Play[];
  lastPlay: Play;
  /** ile kart na ręce zostało autorowi ostatniego zagrania */
  lastPlayerHandSize: number;
  /** ile razy bot już strzelał */
  shots: number;
  /** ile kart w talii „mówi prawdę” (figury + jokery + Diabeł/Lustro) */
  truthfulTotal: number;
}

/** Czy bot krzyczy „KŁAMCA!”. Jeśli zgłoszeń jest więcej, niż może istnieć, zawsze sprawdza. */
export function shouldBotChallenge(ctx: ChallengeContext, rng: Rng): boolean {
  const tr = (c: Card) => isTruthful(c, ctx.table);
  const own = ctx.hand.filter(tr).length
    + ctx.plays.filter(p => p.seat === ctx.seat).reduce((a, p) => a + p.cards.filter(tr).length, 0);
  const claims = ctx.plays.filter(p => p.seat !== ctx.seat).reduce((a, p) => a + p.cards.length, 0);
  if (own + claims > ctx.truthfulTotal) return true;
  const n = ctx.lastPlay.cards.length;
  let pr = 0.07 + 0.12 * (n - 1) + 0.5 * Math.pow((own + claims) / ctx.truthfulTotal, 2);
  if (ctx.lastPlayerHandSize === 0) pr += 0.12;
  if (ctx.hand.filter(tr).length === 0) pr += 0.2;
  pr -= 0.15 / (6 - ctx.shots);
  pr *= ctx.traits.susp;
  return rng() < Math.max(0.03, Math.min(0.92, pr));
}
