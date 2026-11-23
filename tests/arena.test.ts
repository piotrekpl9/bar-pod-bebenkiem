import { describe, expect, it } from 'vitest';
import { BotBrain } from '../src/arena/bot';
import { Duel, IDLE, sanitizeDuelMsg, type DuelInput, type DuelMsg } from '../src/arena/duel';
import { MAP, SPAWNS, mirror } from '../src/arena/map';
import { FREEZE_S, ROUND_S, WIN_ROUNDS, endRound, newMatch, tickMatch } from '../src/arena/match';
import { buildNav, findPath } from '../src/arena/nav';
import { EYE_STAND, NO_INPUT, RADIUS, newBody, overlap, stepBody, type MoveInput } from '../src/arena/physics';
import { rayBox, rayMap, rayPlayer } from '../src/arena/ray';
import { MAX_HP, damage, newArms, tickArms, tryFire } from '../src/arena/weapons';
import { seededRng } from '../src/core/rng';

const run = (b: ReturnType<typeof newBody>, inp: Partial<MoveInput>, secs: number) => {
  for (let t = 0; t < secs; t += 1 / 60) stepBody(b, { ...NO_INPUT, yaw: 0, ...inp }, 1 / 60, MAP);
};

describe('mapa', () => {
  it('spawny są wolne i w granicach', () => {
    for (const s of SPAWNS.flat()) {
      expect(overlap(s.x, 0, s.z, 1.8, MAP)).toBeNull();
    }
  });
  it('jest symetryczna środkowo (uczciwa dla obu stron)', () => {
    const key = (b: { x0: number; z0: number; x1: number; z1: number; y0: number; y1: number }) => [b.x0, b.z0, b.x1, b.z1, b.y0, b.y1].map(v => v.toFixed(2)).join(',');
    const all = new Set(MAP.map(key));
    const asym = MAP.filter(b => !all.has(key(mirror(b))));
    expect(asym.every(b => b.m === 'door')).toBe(true); // tylko uchylone drzwi w tunelu
    SPAWNS[0].forEach((s, i) => { expect(SPAWNS[1][i].x).toBe(-s.x); expect(SPAWNS[1][i].z + 0).toBe(-s.z + 0); });
  });
  it('z każdego spawnu da się dojść do każdego spawnu przeciwnika', () => {
    const g = buildNav(MAP);
    for (const a of SPAWNS[0]) for (const b of SPAWNS[1]) {
      const p = findPath(g, a.x, a.z, b.x, b.z);
      expect(p).not.toBeNull();
      expect(p!.length).toBeGreaterThan(0);
    }
  });
});

describe('ruch', () => {
  it('ściana zatrzymuje gracza', () => {
    const b = newBody(-24, 0); // przed nami (w −z?) – idziemy w +x na mur spawnu (x = −17)
    run(b, { fwd: 1, yaw: -Math.PI / 2 }, 3);
    expect(b.x).toBeLessThan(-17 - RADIUS + 0.01);
    expect(b.x).toBeGreaterThan(-17.5);
  });
  it('wchodzi po schodach na podest, ale nie wskoczy na wysoką skrzynię', () => {
    const b = newBody(-22.5, 6.5);
    run(b, { fwd: 1, yaw: Math.PI }, 2.5); // yaw = π → idziemy w +z
    expect(b.y).toBeCloseTo(1.6, 1);
    const c = newBody(-21.5, -4.9);
    run(c, { fwd: 1, yaw: -Math.PI / 2, jump: true }, 2); // skrzynia 1,2 m – za wysoko
    expect(c.x).toBeLessThan(-20.5 - RADIUS + 0.01);
  });
  it('skok przeskakuje niski murek (1 m)', () => {
    const b = newBody(-10, 8);
    let maxY = 0;
    for (let t = 0; t < 2; t += 1 / 60) { stepBody(b, { ...NO_INPUT, fwd: 1, jump: true, yaw: Math.PI }, 1 / 60, MAP); maxY = Math.max(maxY, b.y); }
    expect(maxY).toBeGreaterThanOrEqual(1.0);
    expect(b.z).toBeGreaterThan(9.6);
  });
  it('spada na ziemię i stoi', () => {
    const b = newBody(0, 8, 3); b.onGround = false;
    run(b, {}, 2);
    expect(b.y).toBe(0); expect(b.onGround).toBe(true);
  });
  it('kucanie obniża oczy, pod niskim sufitem nie da się wstać', () => {
    const b = newBody(-10, 7);
    run(b, { crouch: true }, 0.5);
    expect(b.eye).toBeLessThan(EYE_STAND - 0.3);
    run(b, {}, 0.5);
    expect(b.crouch).toBe(false);
  });
});

describe('strzały', () => {
  it('promień trafia w pudełko i w ziemię', () => {
    expect(rayBox([0, 0.5, 0], [1, 0, 0], 2, 0, -1, 3, 1, 1)).toBeCloseTo(2);
    expect(rayBox([0, 0.5, 0], [-1, 0, 0], 2, 0, -1, 3, 1, 1)).toBe(Infinity);
    const g = rayMap([0, 2, 8], [0, -1, 0], 10, MAP);
    expect(g?.box).toBeNull(); expect(g?.t).toBeCloseTo(2);
  });
  it('głowa i tułów', () => {
    const t = { x: 5, y: 0, z: 0, crouch: false };
    expect(rayPlayer([0, 1.6, 0], [1, 0, 0], t, 100)?.head).toBe(true);
    expect(rayPlayer([0, 1.0, 0], [1, 0, 0], t, 100)?.head).toBe(false);
    expect(rayPlayer([0, 2.2, 0], [1, 0, 0], t, 100)).toBeNull();
    expect(rayPlayer([0, 1.0, 0], [1, 0, 0], t, 3)).toBeNull(); // ściana bliżej
  });
  it('obrażenia: karabin zabija w głowę, w tułów potrzeba 3 kul', () => {
    expect(damage('rifle', true, 10)).toBeGreaterThanOrEqual(MAX_HP);
    expect(damage('rifle', false, 10) * 2).toBeLessThan(MAX_HP);
    expect(damage('rifle', false, 10) * 3).toBeGreaterThanOrEqual(MAX_HP);
    expect(damage('pistol', true, 10)).toBeLessThan(MAX_HP);
  });
  it('karabin strzela seriami, pistolet trzeba klikać, pusty magazynek przeładowuje', () => {
    const a = newArms();
    let shots = 0;
    for (let t = 0; t < 1.001; t += 0.01) if (tryFire(a, true, t)) shots++;
    expect(shots).toBe(10);
    const p = newArms(); p.cur = 'pistol';
    let ps = 0;
    for (let t = 0; t < 1; t += 0.01) if (tryFire(p, true, t)) ps++;
    expect(ps).toBe(1);
    const e = newArms(); e.ammo.rifle.mag = 0;
    expect(tryFire(e, true, 0)).toBe(false);
    expect(e.reloadEnd).toBeGreaterThan(0);
    expect(tickArms(e, 5, 0.1)).toBe(true);
    expect(e.ammo.rifle.mag).toBe(30); expect(e.ammo.rifle.reserve).toBe(60);
  });
});

describe('mecz', () => {
  it('faza zamrożenia, runda, koniec rundy, następna runda', () => {
    let m = newMatch(0);
    expect(tickMatch(m, 1, [100, 100])).toBeNull();
    m = tickMatch(m, FREEZE_S, [100, 100])!; expect(m.phase).toBe('live');
    m = endRound(m, 1, 'kill', 10)!; expect(m.score).toEqual([0, 1]); expect(m.phase).toBe('end');
    expect(endRound(m, 1, 'kill', 10)).toBeNull(); // druga śmierć w tej samej rundzie nic nie zmienia
    m = tickMatch(m, 20, [100, 100])!; expect(m.round).toBe(2); expect(m.phase).toBe('freeze');
  });
  it('koniec czasu: wygrywa ten z większym zdrowiem, remis bez punktu', () => {
    const live = { ...newMatch(0), phase: 'live' as const, until: ROUND_S };
    expect(tickMatch(live, ROUND_S, [40, 70])!.score).toEqual([0, 1]);
    expect(tickMatch(live, ROUND_S, [50, 50])!.score).toEqual([0, 0]);
  });
  it('mecz do 5 wygranych', () => {
    let m = { ...newMatch(0), phase: 'live' as const, score: [WIN_ROUNDS - 1, 2] as [number, number] };
    m = endRound(m, 0, 'kill', 0)! as typeof m;
    expect(m.phase).toBe('over');
  });
});

describe('wiadomości', () => {
  it('odrzuca śmieci i przycina wartości', () => {
    expect(sanitizeDuelMsg({ k: 'hit', r: 1, dmg: 9999, head: 1, from: [0, 0, 0] })).toBeNull();
    expect(sanitizeDuelMsg({ k: 'hit', r: 1, dmg: 500, head: 1, from: [0, 0, 0] })).toMatchObject({ dmg: 150, head: true });
    expect(sanitizeDuelMsg({ k: 'st', r: 1, p: [0, 0, 'x'], a: [0, 0], hp: 1, v: 0 })).toBeNull();
    expect(sanitizeDuelMsg({ k: 'ph', r: 1, ph: 'boom', left: 1, score: [0, 0], sp: [0, 0] })).toBeNull();
    expect(sanitizeDuelMsg({ k: 'nope' })).toBeNull();
    expect(sanitizeDuelMsg(null)).toBeNull();
  });
});

/** Dwa pojedynki połączone „siecią” z opóźnieniem (w klatkach). */
function linked(lag: number, seed: number) {
  const qa: { at: number; m: DuelMsg }[] = [], qb: { at: number; m: DuelMsg }[] = [];
  let frame = 0;
  const log: string[] = [];
  const a = new Duel(0, { send: m => qb.push({ at: frame + lag, m: JSON.parse(JSON.stringify(m)) }), phase: m => log.push(`A ${m.round} ${m.phase} ${m.score}`) }, 0, seededRng(seed));
  const b = new Duel(1, { send: m => qa.push({ at: frame + lag, m: JSON.parse(JSON.stringify(m)) }), phase: m => log.push(`B ${m.round} ${m.phase} ${m.score}`) }, 0, seededRng(seed + 1));
  const deliver = (q: typeof qa, d: Duel, now: number) => { while (q.length && q[0].at <= frame) d.receive(q.shift()!.m, now); };
  const step = (now: number, ia: DuelInput, ib: DuelInput) => {
    frame++;
    deliver(qa, a, now); deliver(qb, b, now);
    a.update(now, 1 / 60, ia); b.update(now, 1 / 60, ib);
  };
  return { a, b, step, log };
}

describe('pojedynek', () => {
  it('bot kontra bot: mecz kończy się 5 wygranymi i obie strony widzą ten sam wynik', () => {
    for (const [seed, level] of [[1, 'normal'], [7, 'hard']] as const) {
      const { a, b, step } = linked(3, seed);
      const ba = new BotBrain(level, seededRng(seed + 10)), bb = new BotBrain(level, seededRng(seed + 20));
      let now = 0;
      while (!(a.ended && b.ended) && now < 1500) {
        now += 1 / 60;
        step(now, ba.think(a, now, 1 / 60), bb.think(b, now, 1 / 60));
      }
      expect(a.ended).toBe(true); expect(b.ended).toBe(true);
      expect(a.match.score).toEqual(b.match.score);
      expect(Math.max(...a.match.score)).toBe(WIN_ROUNDS);
      expect(now).toBeLessThan(1500);
      console.log(level, 'mecz', a.match.score, 'czas', now.toFixed(0), 's');
    }
  });
  it('trafienie: strzelający celuje w stojącego przeciwnika i zabiera mu zdrowie', () => {
    const { a, b, step } = linked(1, 3);
    let now = 0;
    for (; now < FREEZE_S + 0.3; now += 1 / 60) step(now, { ...IDLE, yaw: a.me.yaw }, { ...IDLE, yaw: b.me.yaw });
    // ustawiamy obu naprzeciw siebie na otwartym placu
    a.me.body.x = -10; a.me.body.z = 6; b.me.body.x = -4; b.me.body.z = 6;
    for (let i = 0; i < 20; i++) { now += 1 / 60; step(now, { ...IDLE, yaw: -Math.PI / 2 }, { ...IDLE, yaw: Math.PI / 2 }); }
    expect(a.match.phase).toBe('live');
    const pitch = Math.atan2(b.me.body.eye - 0.5 - a.me.body.eye, 6);
    for (let i = 0; i < 40 && b.me.alive; i++) { now += 1 / 60; step(now, { ...IDLE, yaw: -Math.PI / 2, pitch, fire: true }, { ...IDLE, yaw: Math.PI / 2 }); }
    for (let i = 0; i < 10; i++) { now += 1 / 60; step(now, { ...IDLE, yaw: -Math.PI / 2 }, { ...IDLE, yaw: Math.PI / 2 }); }
    expect(b.me.alive).toBe(false);
    expect(a.match.score).toEqual([1, 0]);
    expect(b.match.score).toEqual([1, 0]);
  });
  it('wyjście przeciwnika daje wygraną walkowerem', () => {
    const { a, b, step } = linked(1, 5);
    step(0.1, IDLE, IDLE);
    b.quit();
    for (let i = 0; i < 3; i++) step(0.2 + i / 60, IDLE, IDLE);
    expect(a.ended).toBe(true);
    expect(a.match.score[0]).toBe(WIN_ROUNDS);
  });
});
