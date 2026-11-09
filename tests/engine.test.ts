import { describe, expect, it } from 'vitest';
import { KINDS } from '../src/core/constants';
import { buildDeck } from '../src/core/deck';
import { GameEngine, botSlot, newSlot, type EngineIO, type PlayerSlot } from '../src/core/engine';
import { seededRng, type Rng } from '../src/core/rng';
import type { Action, Card, GameEvent, Mode, TableSize, TurnRequest } from '../src/core/types';

const tick = (): Promise<void> => Promise.resolve();

/** Wejście/wyjście bez animacji i bez czekania, z „ludźmi” klikającymi losowo. */
function fakeIO(rng: Rng, humanPolicy?: (seat: number, req: TurnRequest, hand: Card[]) => Action) {
  const events: GameEvent[] = [];
  const hands = new Map<number, Card[]>();
  let engine: GameEngine;
  const io: EngineIO = {
    emit: ev => { events.push(ev); },
    sendHand: (seat, cards) => { hands.set(seat, cards); },
    waitHuman: async (seat, req) => {
      await tick();
      const hand = engine.seats[seat]!.hand;
      if (humanPolicy) return humanPolicy(seat, req, hand);
      if (req.canChallenge && (req.forced || rng() < 0.35)) return { type: 'liar' };
      const n = Math.min(hand.length, 1 + Math.floor(rng() * 3));
      return { type: 'play', cards: Array.from({ length: n }, (_, i) => i) };
    },
    thinkDelay: tick,
    settle: tick,
    pause: tick,
  };
  return { io, events, hands, attach: (e: GameEngine) => { engine = e; } };
}

function setup(size: TableSize, mode: Mode, seed: number, humans = 1, policy?: Parameters<typeof fakeIO>[1]) {
  const rng = seededRng(seed);
  const f = fakeIO(rng, policy);
  const seats: PlayerSlot[] = Array.from({ length: size }, (_, i) => (i < humans ? newSlot(`Gracz${i}`, KINDS[i], false) : botSlot(KINDS[i])));
  const engine = new GameEngine(seats, f.io, { size, mode, rng });
  f.attach(engine);
  return { engine, ...f };
}

describe('pełne partie (symulacja)', () => {
  const cases: [TableSize, Mode][] = [[4, 'classic'], [6, 'classic'], [8, 'classic'], [4, 'special'], [6, 'special'], [8, 'special']];

  it.each(cases)('stół %i, tryb %s: 40 partii kończy się poprawnie', async (size, mode) => {
    for (let seed = 1; seed <= 40; seed++) {
      const { engine, events } = setup(size, mode, seed * 97 + size, 2);
      const res = await engine.run();
      expect(res).not.toBeNull();
      const alive = engine.seats.filter(s => s!.alive);
      if (res!.winner >= 0) {
        expect(alive).toHaveLength(1);
        expect(engine.seats[res!.winner]!.alive).toBe(true);
      } else {
        expect(alive.every(s => s!.isBot)).toBe(true);
      }
      expect(events.at(-1)!.t).toBe('end');

      // nikt nie strzela więcej razy, niż ma komór, a ginie dokładnie na swoim naboju
      for (const s of engine.seats) {
        expect(s!.shots).toBeLessThanOrEqual(6);
        if (!s!.alive) expect(s!.shots).toBe(s!.bullet + 1);
      }

      // każde zagranie to 1–3 karty, a po „reveal” idzie tyle strzałów, ile wynika z efektu
      for (let i = 0; i < events.length; i++) {
        const ev = events[i];
        if (ev.t === 'play') expect(ev.n).toBeGreaterThanOrEqual(1), expect(ev.n).toBeLessThanOrEqual(3);
        if (ev.t === 'reveal') {
          const shots = [];
          for (let j = i + 1; j < events.length && events[j].t === 'shot'; j++) shots.push(events[j] as Extract<GameEvent, { t: 'shot' }>);
          expect(shots.length).toBeGreaterThanOrEqual(ev.shooters.length);
          expect(shots.length).toBeLessThanOrEqual(ev.shooters.length * (ev.double ? 2 : 1));
          expect(new Set(shots.map(s => s.seat))).toEqual(new Set(ev.shooters));
          if (ev.effect === 'devil') expect(ev.shooters).not.toContain(ev.target);
          if (ev.effect === 'mirror') expect(ev.shooters).toEqual([ev.challenger]);
        }
      }
    }
  });

  it('w każdej rundzie liczba zagranych kart zgadza się z ręką', async () => {
    const { engine, events } = setup(6, 'special', 123, 1);
    await engine.run();
    let inHands = 0, played = 0;
    for (const ev of events) {
      if (ev.t === 'round') { inHands = ev.st.reduce((a, s) => a + (s?.count ?? 0), 0); played = 0; }
      if (ev.t === 'play') {
        played += ev.n;
        expect(ev.st.reduce((a, s) => a + (s?.count ?? 0), 0)).toBe(inHands - played);
      }
    }
  });

  it('karty z rąk nie wychodzą poza talię', async () => {
    const { engine, hands } = setup(4, 'special', 5, 4);
    await engine.run();
    const deck = buildDeck(4, 'special');
    for (const h of hands.values()) for (const c of h) expect(deck).toContain(c);
  });
});

describe('ochrona przed oszustwem i błędami', () => {
  it('niepoprawny ruch człowieka zamienia się na ruch automatyczny', async () => {
    const { engine, events } = setup(4, 'classic', 77, 1, (_s, req) =>
      req.canChallenge && req.forced ? { type: 'liar' } : { type: 'play', cards: [0, 0, 9, 9] });
    const res = await engine.run();
    expect(res).not.toBeNull();
    // człowiek (miejsce 0) zawsze zagrywa dokładnie 1 kartę (ruch automatyczny)
    for (const ev of events) if (ev.t === 'play' && ev.seat === 0) expect(ev.n).toBe(1);
  });

  it('„KŁAMCA!” bez prawa do sprawdzenia jest ignorowany', async () => {
    const { engine, events } = setup(4, 'classic', 8, 1, () => ({ type: 'liar' }));
    await engine.run();
    let lastTurn: Extract<GameEvent, { t: 'turn' }> | null = null;
    let liars = 0;
    for (const ev of events) {
      if (ev.t === 'turn') lastTurn = ev;
      if (ev.t === 'liar') { liars++; expect(lastTurn!.canChallenge).toBe(true); expect(lastTurn!.seat).toBe(ev.seat); }
      // człowiek, który nie mógł sprawdzić, zagrał automatycznie 1 kartę
      if (ev.t === 'play' && ev.seat === 0) expect(ev.n).toBe(1);
    }
    expect(liars).toBeGreaterThan(0);
  });

  it('stop() przerywa partię', async () => {
    const { engine } = setup(4, 'classic', 3, 4, () => new Promise<Action>(() => {}) as unknown as Action);
    const p = engine.run();
    await tick(); await tick();
    engine.stop();
    expect(engine.running).toBe(false);
    // obietnica partii nigdy się nie rozstrzyga, ale silnik nie emituje już nic nowego
    expect(p).toBeInstanceOf(Promise);
  });

  it('zła liczba miejsc to błąd', () => {
    const { io } = fakeIO(seededRng(1));
    expect(() => new GameEngine([botSlot('frog'), botSlot('robot')], io, { size: 4, mode: 'classic', rng: seededRng(1) })).toThrow();
  });
});

describe('boty w imieniu rozłączonego gracza', () => {
  it('botDecide zwraca poprawny ruch dla każdej sytuacji', async () => {
    const { engine } = setup(4, 'special', 21, 4, () => ({ type: 'liar' }));
    engine.seats.forEach(s => { s!.hand = ['K', 'Q', 'D']; });
    engine.table = 'K';
    expect(engine.botDecide(0, { canChallenge: false, forced: false })).toMatchObject({ type: 'play' });
    engine.seats[0]!.hand = [];
    engine.lastPlay = { seat: 1, cards: ['K'] };
    expect(engine.botDecide(0, { canChallenge: true, forced: true })).toEqual({ type: 'liar' });
  });
});
