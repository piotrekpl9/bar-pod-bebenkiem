// Pojedynek 1v1 – symulacja jednej strony (bez grafiki i bez sieci).
// Każdy gracz liczy własny ruch i własne strzały; o trafieniu decyduje strzelający (widzi to, co widzi),
// o śmierci – trafiony (pilnuje swojego zdrowia), a o wyniku rundy – strona 0 (prowadzący).

import { MAP, SPAWNS } from './map';
import { endRound, newMatch, tickMatch, type MatchState, type Phase, type Side } from './match';
import { type Body, type MoveInput, lookDir, newBody, speedOf, stepBody } from './physics';
import { rayMap, rayPlayer, type V3 } from './ray';
import { MAX_HP, WEAPONS, currentSpread, damage, newArms, scatter, startReload, switchWeapon, tickArms, tryFire, type Arms, type WeaponId } from './weapons';

// ---------- wiadomości między graczami ----------
export type DuelMsg =
  /** stan gracza ~20 razy na sekundę */
  | { k: 'st'; r: number; p: V3; a: [number, number]; c: 0 | 1; w: 0 | 1; hp: number; v: number }
  /** strzał (do smugi i dźwięku u drugiej strony) */
  | { k: 'fire'; o: V3; e: V3; w: 0 | 1 }
  /** „trafiłem cię” – od strzelającego do trafionego */
  | { k: 'hit'; r: number; dmg: number; head: boolean; from: V3 }
  /** „zginąłem” – od trafionego */
  | { k: 'dead'; r: number }
  /** faza meczu – od prowadzącego; `left` w sekundach, `sp` – numery spawnów obu stron */
  | { k: 'ph'; r: number; ph: Phase; left: number; score: [number, number]; last: Side | -1; how: MatchState['how']; sp: [number, number] }
  /** wyjście z automatu */
  | { k: 'bye' };

const num = (v: unknown, lim = 1e4): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= lim;
const v3 = (v: unknown): v is V3 => Array.isArray(v) && v.length === 3 && v.every(x => num(x, 200));
const PHASES: Phase[] = ['freeze', 'live', 'end', 'over'];

/** Sprawdza wiadomość od drugiego gracza (nikomu nie ufamy na słowo). */
export function sanitizeDuelMsg(m: unknown): DuelMsg | null {
  if (!m || typeof m !== 'object') return null;
  const o = m as Record<string, unknown>;
  switch (o.k) {
    case 'st':
      if (!num(o.r) || !v3(o.p) || !Array.isArray(o.a) || o.a.length !== 2 || !num(o.a[0], 100) || !num(o.a[1], 3) || !num(o.hp, 1000) || !num(o.v, 100)) return null;
      return { k: 'st', r: o.r, p: o.p, a: [o.a[0], o.a[1]], c: o.c ? 1 : 0, w: o.w ? 1 : 0, hp: Math.max(0, Math.min(MAX_HP, o.hp)), v: o.v };
    case 'fire': return v3(o.o) && v3(o.e) ? { k: 'fire', o: o.o, e: o.e, w: o.w ? 1 : 0 } : null;
    case 'hit':
      if (!num(o.r) || !num(o.dmg, 1000) || o.dmg < 0 || !v3(o.from)) return null;
      return { k: 'hit', r: o.r, dmg: Math.min(o.dmg, 150), head: !!o.head, from: o.from };
    case 'dead': return num(o.r) ? { k: 'dead', r: o.r } : null;
    case 'ph': {
      const sc = o.score, sp = o.sp;
      if (!num(o.r) || !PHASES.includes(o.ph as Phase) || !num(o.left, 1000) || !Array.isArray(sc) || sc.length !== 2 || !sc.every(x => num(x, 99))) return null;
      if (!Array.isArray(sp) || sp.length !== 2 || !sp.every(x => Number.isInteger(x) && x >= 0 && x < 3)) return null;
      const last = o.last === 0 || o.last === 1 ? o.last : -1;
      const how = (['kill', 'time', 'quit', ''] as const).find(h => h === o.how) ?? '';
      return { k: 'ph', r: o.r, ph: o.ph as Phase, left: Math.max(0, o.left), score: [sc[0], sc[1]], last, how, sp: [sp[0], sp[1]] };
    }
    case 'bye': return { k: 'bye' };
    default: return null;
  }
}

// ---------- stan ----------
export interface Fighter {
  body: Body;
  yaw: number; pitch: number;
  /** odrzut celownika (dodawany do pitch przy strzałach, sam wraca) */
  punch: number;
  hp: number;
  alive: boolean;
  arms: Arms;
}

/** Przeciwnik tak, jak go widzimy: wygładzona pozycja z sieci. */
export interface Foe {
  x: number; y: number; z: number; yaw: number; pitch: number; crouch: boolean;
  weapon: WeaponId; hp: number; alive: boolean; speed: number;
  /** ostatnie dane z sieci */
  tx: number; ty: number; tz: number; tyaw: number; tpitch: number;
  seen: number;
  /** kiedy ostatnio strzelał (bot „słyszy” strzały) */
  fired: number;
}

export interface DuelInput extends Omit<MoveInput, 'yaw'> {
  yaw: number; pitch: number;
  fire: boolean; reload: boolean;
  weapon: WeaponId | null;
}

export const IDLE: DuelInput = { fwd: 0, side: 0, jump: false, crouch: false, walk: false, yaw: 0, pitch: 0, fire: false, reload: false, weapon: null };

export interface ShotInfo { side: Side; o: V3; e: V3; w: WeaponId; hit: 'wall' | 'ground' | 'player' | 'none'; normal: V3 | null }

export interface DuelHooks {
  send(m: DuelMsg): void;
  shot?(s: ShotInfo): void;
  /** mnie trafiono */
  hurt?(dmg: number, head: boolean, from: V3): void;
  /** ja trafiłem */
  hitConfirm?(head: boolean, kill: boolean): void;
  /** zmiana fazy meczu (nowa runda, koniec rundy, koniec meczu) */
  phase?(m: MatchState, prev: MatchState | null): void;
  reloaded?(): void;
  /** przeciwnik wyszedł z automatu */
  left?(): void;
}

const ST_EVERY = 0.05;
const R = (x: number, k = 100) => Math.round(x * k) / k;

export class Duel {
  readonly lead: boolean;
  me: Fighter;
  foe: Foe;
  match: MatchState;
  sp: [number, number] = [0, 0];
  private lastSt = -1;
  private lastPh = 0;
  private spFrom: 'own' | 'lead' = 'own';
  ended = false;

  constructor(readonly side: Side, private readonly hooks: DuelHooks, now: number, private readonly rnd: () => number = Math.random, readonly boxes = MAP) {
    this.lead = side === 0;
    this.match = newMatch(now);
    if (this.lead) this.sp = [Math.floor(rnd() * 3), Math.floor(rnd() * 3)];
    this.me = this.freshFighter();
    this.foe = this.freshFoe();
    if (this.lead) this.sendPhase(now);
    hooks.phase?.(this.match, null);
  }

  get other(): Side { return (1 - this.side) as Side; }

  private freshFighter(): Fighter {
    const s = SPAWNS[this.side][this.sp[this.side]];
    return { body: newBody(s.x, s.z), yaw: s.yaw, pitch: 0, punch: 0, hp: MAX_HP, alive: true, arms: newArms() };
  }

  private freshFoe(): Foe {
    const s = SPAWNS[this.other][this.sp[this.other]];
    return { x: s.x, y: 0, z: s.z, yaw: s.yaw, pitch: 0, crouch: false, weapon: 'rifle', hp: MAX_HP, alive: true, speed: 0, tx: s.x, ty: 0, tz: s.z, tyaw: s.yaw, tpitch: 0, seen: 0, fired: -99 };
  }

  /** Oczy gracza. */
  eye(): V3 { const b = this.me.body; return [b.x, b.y + b.eye, b.z]; }

  private sendPhase(now: number): void {
    this.lastPh = now;
    const m = this.match;
    this.hooks.send({ k: 'ph', r: m.round, ph: m.phase, left: Math.max(0, m.until - now), score: m.score, last: m.last, how: m.how, sp: this.sp });
  }

  private setMatch(next: MatchState, now: number): void {
    const prev = this.match;
    this.match = next;
    if (next.phase === 'freeze' && (prev.phase !== 'freeze' || prev.round !== next.round)) {
      this.me = this.freshFighter();
      this.foe = this.freshFoe();
    }
    if (next.phase === 'over') this.ended = true;
    if (this.lead) this.sendPhase(now);
    this.hooks.phase?.(next, prev);
  }

  /** Jedna klatka. */
  update(now: number, dt: number, inp: DuelInput): void {
    const me = this.me;
    // prowadzący pilnuje zegara rundy
    if (this.lead) {
      const hp: [number, number] = [0, 0];
      hp[this.side] = me.alive ? me.hp : 0; hp[this.other] = this.foe.alive ? this.foe.hp : 0;
      const next = tickMatch(this.match, now, hp);
      if (next) {
        if (next.phase === 'freeze') this.sp = [Math.floor(this.rnd() * 3), Math.floor(this.rnd() * 3)];
        this.setMatch(next, now);
      }
      // co sekundę przypominamy fazę – druga strona mogła jeszcze nie słuchać (start, zgubiona wiadomość)
      if (now - this.lastPh > 1) { this.lastPh = now; this.sendPhase(now); }
    }
    const ph = this.match.phase;
    const frozen = !me.alive || ph === 'freeze' || ph === 'over';

    // celowanie i ruch
    me.yaw = inp.yaw; me.pitch = Math.max(-1.45, Math.min(1.45, inp.pitch));
    stepBody(me.body, { ...inp, yaw: me.yaw }, dt, this.boxes, frozen);
    me.punch *= Math.exp(-dt * 7);

    // broń
    const a = me.arms;
    if (me.alive) {
      if (inp.weapon) switchWeapon(a, inp.weapon, now);
      if (inp.reload && startReload(a, now)) { /* dźwięk w widoku */ }
      if (tickArms(a, now, dt)) this.hooks.reloaded?.();
      if (ph === 'live' && tryFire(a, inp.fire, now)) this.fire();
      else if (ph !== 'live') a.released = !inp.fire;
    }

    // przeciwnik: płynne dojście do ostatniej pozycji z sieci
    const f = this.foe, k = 1 - Math.exp(-dt * 16);
    if (Math.hypot(f.tx - f.x, f.tz - f.z) > 4) { f.x = f.tx; f.y = f.ty; f.z = f.tz; }
    f.x += (f.tx - f.x) * k; f.y += (f.ty - f.y) * k; f.z += (f.tz - f.z) * k;
    let dy = f.tyaw - f.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    f.yaw += dy * k; f.pitch += (f.tpitch - f.pitch) * k;

    // stan do drugiej strony
    if (now - this.lastSt >= ST_EVERY) {
      this.lastSt = now;
      const b = me.body;
      this.hooks.send({ k: 'st', r: this.match.round, p: [R(b.x), R(b.y), R(b.z)], a: [R(me.yaw, 1000), R(me.pitch + me.punch, 1000)], c: b.crouch ? 1 : 0, w: a.cur === 'pistol' ? 1 : 0, hp: me.alive ? me.hp : 0, v: R(speedOf(b), 10) });
    }
  }

  /** Strzał: promień od oczu, rozrzut, trafienie w mapę albo przeciwnika. */
  private fire(): void {
    const me = this.me, b = me.body, a = me.arms, w = a.cur;
    const o = this.eye();
    const dir = scatter(lookDir(me.yaw, me.pitch + me.punch), currentSpread(a, speedOf(b), b.onGround, b.crouch), this.rnd);
    me.punch += WEAPONS[w].kick * (0.7 + this.rnd() * 0.6);
    const wallHit = rayMap(o, dir, 300, this.boxes);
    const maxT = wallHit ? wallHit.t : 300;
    const f = this.foe;
    const ph = f.alive ? rayPlayer(o, dir, f, maxT) : null;
    let hit: ShotInfo['hit'] = 'none', t = maxT, normal: V3 | null = null;
    if (ph) {
      hit = 'player'; t = ph.t;
      const dmg = damage(w, ph.head, ph.t);
      this.hooks.send({ k: 'hit', r: this.match.round, dmg, head: ph.head, from: o });
      // przewidujemy śmierć, żeby od razu pokazać trafienie; rozstrzyga trafiony
      const kill = f.hp - dmg <= 0;
      if (kill) f.hp = 0; else f.hp -= dmg;
      this.hooks.hitConfirm?.(ph.head, kill);
    } else if (wallHit) { hit = wallHit.box ? 'wall' : 'ground'; normal = wallHit.normal; }
    const e: V3 = [o[0] + dir[0] * t, o[1] + dir[1] * t, o[2] + dir[2] * t];
    this.hooks.send({ k: 'fire', o, e, w: w === 'pistol' ? 1 : 0 });
    this.hooks.shot?.({ side: this.side, o, e, w, hit, normal });
  }

  /** Wiadomość od drugiego gracza. */
  receive(raw: unknown, now: number): void {
    const m = sanitizeDuelMsg(raw);
    if (!m || this.ended && m.k !== 'bye') return;
    const f = this.foe;
    switch (m.k) {
      case 'st':
        if (m.r !== this.match.round) return;
        f.tx = m.p[0]; f.ty = m.p[1]; f.tz = m.p[2]; f.tyaw = m.a[0]; f.tpitch = m.a[1];
        f.crouch = !!m.c; f.weapon = m.w ? 'pistol' : 'rifle'; f.speed = m.v; f.seen = now;
        if (f.alive && m.hp <= 0 && this.match.phase !== 'freeze') f.alive = false;
        if (f.alive) f.hp = m.hp;
        return;
      case 'fire':
        f.fired = now;
        this.hooks.shot?.({ side: this.other, o: m.o, e: m.e, w: m.w ? 'pistol' : 'rifle', hit: 'none', normal: null });
        return;
      case 'hit': {
        const me = this.me;
        if (m.r !== this.match.round || this.match.phase !== 'live' || !me.alive) return;
        me.hp = Math.max(0, me.hp - m.dmg);
        me.punch += 0.02;
        this.hooks.hurt?.(m.dmg, m.head, m.from);
        if (me.hp <= 0) {
          me.alive = false;
          this.hooks.send({ k: 'dead', r: this.match.round });
          if (this.lead) { const next = endRound(this.match, this.other, 'kill', now); if (next) this.setMatch(next, now); }
        }
        return;
      }
      case 'dead':
        if (m.r !== this.match.round) return;
        f.alive = false; f.hp = 0;
        if (this.lead) { const next = endRound(this.match, this.side, 'kill', now); if (next) this.setMatch(next, now); }
        return;
      case 'ph': {
        if (this.lead) return;
        const spChanged = m.sp[0] !== this.sp[0] || m.sp[1] !== this.sp[1] || this.spFrom !== 'lead';
        this.sp = m.sp; this.spFrom = 'lead';
        const next: MatchState = { round: m.r, score: m.score, phase: m.ph, until: now + m.left, last: m.last, how: m.how };
        const cur = this.match;
        if (cur.round === next.round && cur.phase === next.phase) { // tylko odświeżenie zegara
          this.match = next;
          if (next.phase === 'freeze' && spChanged) { this.me = this.freshFighter(); this.foe = this.freshFoe(); }
          return;
        }
        this.setMatch(next, now);
        return;
      }
      case 'bye': this.opponentLeft(now); return;
    }
  }

  /** Druga strona wyszła albo się rozłączyła: wygrywamy walkowerem. */
  opponentLeft(now: number): void {
    if (this.ended) return;
    const next = endRound({ ...this.match, phase: 'live' }, this.side, 'quit', now);
    this.hooks.left?.();
    if (next) {
      const prev = this.match;
      this.match = next; this.ended = true;
      this.hooks.phase?.(next, prev);
    }
  }

  /** Ja wychodzę. */
  quit(): void { this.hooks.send({ k: 'bye' }); this.ended = true; }
}
