import { chooseBotPlay, shouldBotChallenge } from './bots';
import { BOT_NAMES, CHAMBERS, KINDS, RANKS, TRAITS, TURN_MS } from './constants';
import { deal, truthfulTotal } from './deck';
import { randInt, type Rng } from './rng';
import { isValidPlay, pullTrigger, resolveChallenge, takeCards, turnStatus } from './rules';
import type { Action, Card, GameEvent, Kind, Mode, Play, PublicState, Rank, TableSize, TurnRequest } from './types';

/** Miejsce przy stole z punktu widzenia silnika. Sieć może dopisać własne pola (połączenie, token). */
export interface PlayerSlot {
  name: string;
  kind: Kind;
  isBot: boolean;
  /** bot dosadzony na wolne miejsce (znika przed następną partią) */
  fill?: boolean;
  alive: boolean;
  shots: number;
  bullet: number;
  hand: Card[];
}

/** Wszystko, czego silnik potrzebuje od świata zewnętrznego. */
export interface EngineIO {
  /** zdarzenie dla wszystkich */
  emit(ev: GameEvent): void;
  /** prywatna ręka jednego gracza */
  sendHand(seat: number, cards: Card[], deal: boolean): void;
  /** czeka na ruch człowieka (host pilnuje limitu czasu i rozłączeń) */
  waitHuman(seat: number, req: TurnRequest): Promise<Action>;
  /** „bot myśli…” */
  thinkDelay(): Promise<void>;
  /** czeka, aż animacje u hosta się skończą */
  settle(): Promise<void>;
  /** przerwa między rundami */
  pause(ms: number): Promise<void>;
}

export interface EngineOptions {
  size: TableSize;
  mode: Mode;
  rng: Rng;
}

export interface EndResult {
  winner: number;
  rounds: number;
}

export const newSlot = (name: string, kind: Kind, isBot: boolean, fill = false): PlayerSlot =>
  ({ name, kind, isBot, fill, alive: true, shots: 0, bullet: 0, hand: [] });

export const botSlot = (seat: number): PlayerSlot => {
  const kind = KINDS[seat];
  return newSlot(BOT_NAMES[kind], kind, true, true);
};

/**
 * Silnik partii: tasuje, pilnuje kolejki, rozstrzyga „KŁAMCA!”, strzela, steruje botami.
 * Działa tylko u hosta. Nie wie nic o grafice ani sieci: wszystko idzie przez EngineIO.
 */
export class GameEngine<S extends PlayerSlot = PlayerSlot> {
  readonly size: TableSize;
  readonly mode: Mode;
  private readonly rng: Rng;

  table: Rank = 'K';
  round = 0;
  plays: Play[] = [];
  lastPlay: Play | null = null;
  pileN = 0;
  active = -1;
  running = false;
  private token = 0;

  constructor(public seats: (S | null)[], private readonly io: EngineIO, opts: EngineOptions) {
    if (seats.length !== opts.size) throw new Error(`Liczba miejsc (${seats.length}) ≠ rozmiar stołu (${opts.size})`);
    this.size = opts.size;
    this.mode = opts.mode;
    this.rng = opts.rng;
  }

  get turnMs(): number { return TURN_MS[this.size]; }

  publicState(): PublicState {
    return this.seats.map(s => s ? { name: s.name, kind: s.kind, isBot: s.isBot, alive: s.alive, shots: s.shots, count: s.hand.length } : null);
  }

  private alive(): boolean[] { return this.seats.map(s => !!s && s.alive); }
  private next(i: number): number { return (i + 1) % this.size; }

  /** Przerywa partię (np. wyjście do menu). Oczekujące obietnice zostaną zignorowane. */
  stop(): void { this.token++; this.running = false; }

  /** Decyzja bota, także dla gracza, który się rozłączył w swojej turze. */
  botDecide(seat: number, req: Pick<TurnRequest, 'canChallenge' | 'forced'>): Action {
    const s = this.seats[seat];
    if (!s) return { type: 'liar' };
    const lp = this.lastPlay;
    if (req.canChallenge && lp && (req.forced || shouldBotChallenge({
      seat, hand: s.hand, table: this.table, traits: TRAITS[s.kind], plays: this.plays, lastPlay: lp,
      lastPlayerHandSize: this.seats[lp.seat]?.hand.length ?? 0, shots: s.shots,
      truthfulTotal: truthfulTotal(this.size, this.mode),
    }, this.rng))) return { type: 'liar' };
    if (s.hand.length === 0) return { type: 'liar' };
    return { type: 'play', cards: chooseBotPlay(s.hand, this.table, TRAITS[s.kind], this.rng) };
  }

  /** Ruch, gdy człowiekowi skończył się czas albo przysłał coś niepoprawnego. */
  autoAction(seat: number, req: TurnRequest): Action {
    return req.forced || !this.seats[seat]?.hand.length ? { type: 'liar' } : { type: 'play', cards: [0] };
  }

  /** Rozgrywa całą partię do końca. Zwraca null, jeśli przerwano ją przez stop(). */
  async run(): Promise<EndResult | null> {
    const tok = ++this.token;
    this.running = true;
    this.round = 0;
    for (const s of this.seats) if (s) Object.assign(s, { alive: true, shots: 0, bullet: randInt(this.rng, CHAMBERS), hand: [] });
    this.io.emit({ t: 'begin', st: this.publicState(), mode: this.mode });
    await this.io.settle();
    let starter = this.seats.findIndex(s => s);
    while (tok === this.token) {
      const next = await this.playRound(starter, tok);
      if (tok !== this.token || next == null) return null;
      const alive = this.seats.map((s, i) => (s && s.alive ? i : -1)).filter(i => i >= 0);
      const humansAlive = alive.filter(i => !this.seats[i]!.isBot);
      if (alive.length <= 1 || humansAlive.length === 0) {
        this.running = false;
        const res: EndResult = { winner: alive.length === 1 ? alive[0] : -1, rounds: this.round };
        this.io.emit({ t: 'end', ...res, st: this.publicState() });
        return res;
      }
      starter = next;
      while (!this.seats[starter]?.alive) starter = this.next(starter);
      await this.io.pause(700);
    }
    return null;
  }

  /** Jedna runda: od rozdania do strzału. Zwraca, kto zaczyna następną. */
  private async playRound(starter: number, tok: number): Promise<number | null> {
    this.round++;
    const hands = deal(this.size, this.mode, this.alive(), this.rng);
    this.seats.forEach((s, i) => { if (s) s.hand = hands[i] ?? []; });
    this.table = RANKS[randInt(this.rng, RANKS.length)];
    this.plays = []; this.lastPlay = null; this.pileN = 0; this.active = -1;
    this.io.emit({ t: 'round', round: this.round, table: this.table, st: this.publicState() });
    this.seats.forEach((s, i) => { if (s && !s.isBot) this.io.sendHand(i, s.hand.slice(), true); });
    await this.io.settle();

    let cur = starter;
    for (let guard = 0; guard < 500 && tok === this.token; guard++) {
      const status = turnStatus(cur, this.alive(), this.seats.map(s => s?.hand.length ?? 0), this.lastPlay);
      if (status.kind === 'skip') { cur = this.next(cur); continue; }
      const req: TurnRequest = { canChallenge: status.canChallenge, forced: status.forced, ms: this.turnMs };
      const action = await this.ask(cur, req);
      if (tok !== this.token) return null;

      if (action.type === 'liar') return this.challenge(cur);

      const s = this.seats[cur]!;
      const cards = takeCards(s.hand, action.cards);
      this.lastPlay = { seat: cur, cards };
      this.plays.push(this.lastPlay);
      this.pileN += cards.length;
      this.io.emit({ t: 'play', seat: cur, n: cards.length, st: this.publicState() });
      if (!s.isBot) this.io.sendHand(cur, s.hand.slice(), false);
      await this.io.settle();
      cur = this.next(cur);
    }
    return null;
  }

  private async ask(seat: number, req: TurnRequest): Promise<Action> {
    this.active = seat;
    const lp = this.lastPlay;
    this.io.emit({ t: 'turn', seat, ...req, lastSeat: lp ? lp.seat : -1, lastN: lp ? lp.cards.length : 0 });
    const s = this.seats[seat]!;
    if (s.isBot) {
      await this.io.thinkDelay();
      return this.botDecide(seat, req);
    }
    const a = await this.io.waitHuman(seat, req);
    return this.sanitize(seat, req, a);
  }

  /** Nie ufa nikomu: niepoprawny ruch zamienia na ruch automatyczny. */
  private sanitize(seat: number, req: TurnRequest, a: Action): Action {
    const hand = this.seats[seat]?.hand ?? [];
    if (a?.type === 'liar' && req.canChallenge) return a;
    if (a?.type === 'play' && !req.forced && isValidPlay(a.cards, hand.length)) return a;
    return this.autoAction(seat, req);
  }

  private async challenge(challenger: number): Promise<number> {
    const lp = this.lastPlay!;
    this.io.emit({ t: 'liar', seat: challenger, target: lp.seat });
    const res = resolveChallenge({ cards: lp.cards, table: this.table, challenger, player: lp.seat, alive: this.alive() });
    this.io.emit({
      t: 'reveal', cards: lp.cards, truthful: res.truthful, target: lp.seat, challenger,
      effect: res.effect, double: res.double, shooters: res.shooters,
    });
    for (const j of res.shooters) {
      for (let k = 0; k < (res.double ? 2 : 1); k++) {
        const L = this.seats[j]!;
        if (!L.alive) break;
        const { dead, den } = pullTrigger(L);
        if (dead) L.alive = false;
        this.io.emit({ t: 'shot', seat: j, dead, den, second: k === 1, st: this.publicState() });
      }
    }
    await this.io.settle();
    return res.nextStarter;
  }
}
