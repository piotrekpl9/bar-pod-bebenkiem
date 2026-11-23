// Bot do treningu na automacie. Steruje własnym pojedynkiem (Duel) tak jak gracz:
// tymi samymi klawiszami i myszką, z tym samym rozrzutem i odrzutem – tylko decyzje podejmuje sam.

import type { Duel, DuelInput } from './duel';
import { MAP } from './map';
import { buildNav, findPath, walkable, type NavGrid } from './nav';
import { clearLine, headCenter, type V3 } from './ray';

export type BotLevel = 'easy' | 'normal' | 'hard';

interface LevelSpec {
  /** czas reakcji po zauważeniu (s) */
  reaction: number;
  /** błąd celowania tuż po zauważeniu (rad), maleje z czasem */
  aimErr: number;
  /** maksymalna prędkość obrotu (rad/s) */
  turn: number;
  /** szansa celowania w głowę */
  headChance: number;
  /** długość serii (strzały) */
  burst: [number, number];
  pause: number;
}

export const BOT_LEVELS: Record<BotLevel, LevelSpec> = {
  easy: { reaction: 0.8, aimErr: 0.11, turn: 3.2, headChance: 0.05, burst: [2, 4], pause: 0.55 },
  normal: { reaction: 0.45, aimErr: 0.06, turn: 6, headChance: 0.2, burst: [3, 5], pause: 0.38 },
  hard: { reaction: 0.26, aimErr: 0.035, turn: 10, headChance: 0.4, burst: [3, 6], pause: 0.25 },
};

export const BOT_LEVEL_NAMES: Record<BotLevel, string> = { easy: 'łatwy', normal: 'normalny', hard: 'trudny' };

/** Ciekawe miejsca na mapie, które bot sprawdza, zanim cię usłyszy. */
const PATROL: [number, number][] = [
  [-10, 6], [-3, 9.5], [0, 6.2], [-11, -6], [-10, -12], [-4, -6.6], [-13, 2.5], [0, 0.6],
  [10, -6], [3, -9.5], [0, -6.2], [11, 6], [10, 12], [4, 6.6], [13, -2.5],
];

let navCache: NavGrid | null = null;
const nav = (): NavGrid => (navCache ??= buildNav(MAP));

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export class BotBrain {
  private yaw = 0; private pitch = 0;
  private noticedAt = -1; private lastSeen = -99;
  private lastPos: [number, number] | null = null;
  private path: [number, number][] = [];
  private repathAt = 0;
  private burstLeft = 0; private pauseUntil = 0;
  private strafe = 1; private strafeUntil = 0;
  private stuckT = 0;
  private patrol: [number, number] | null = null;
  private aimHead = false;
  private errX = 0; private errY = 0;
  private round = -1;
  private readonly L: LevelSpec;

  constructor(level: BotLevel, private readonly rnd: () => number = Math.random) { this.L = BOT_LEVELS[level]; }

  think(d: Duel, now: number, dt: number): DuelInput {
    const me = d.me, b = me.body, foe = d.foe, L = this.L;
    const inp: DuelInput = { fwd: 0, side: 0, jump: false, crouch: false, walk: false, yaw: this.yaw, pitch: this.pitch, fire: false, reload: false, weapon: null };
    if (d.match.round !== this.round || d.match.phase === 'freeze') {
      // nowa runda: patrzymy tam, gdzie spawn
      this.round = d.match.round; this.yaw = me.yaw; this.pitch = 0;
      this.noticedAt = -1; this.lastPos = null; this.path = []; this.repathAt = 0; this.patrol = null;
      inp.yaw = this.yaw; return inp;
    }
    if (!me.alive || d.match.phase !== 'live') return inp;

    const eye: V3 = [b.x, b.y + b.eye, b.z];
    const head = headCenter(foe);
    const chest: V3 = [foe.x, foe.y + (foe.crouch ? 0.8 : 1.15), foe.z];
    const dist = Math.hypot(foe.x - b.x, foe.z - b.z);
    const los = foe.alive && (clearLine(eye, head, MAP) || clearLine(eye, chest, MAP));
    const toFoeYaw = Math.atan2(-(foe.x - b.x), -(foe.z - b.z));
    const inFov = Math.abs(wrap(toFoeYaw - this.yaw)) < 1.1 || dist < 5;
    const visible = los && (inFov || this.noticedAt >= 0);

    if (visible) {
      if (this.noticedAt < 0) {
        this.noticedAt = now;
        this.aimHead = this.rnd() < L.headChance;
        this.errX = (this.rnd() - 0.5) * 2 * L.aimErr; this.errY = (this.rnd() - 0.5) * 2 * L.aimErr;
      }
      this.lastSeen = now; this.lastPos = [foe.x, foe.z]; this.path = [];
    } else if (now - this.lastSeen > 0.7) this.noticedAt = -1;

    const a = me.arms, am = a.ammo[a.cur];
    if (a.cur === 'rifle' && am.mag === 0 && am.reserve === 0) inp.weapon = 'pistol';
    if (am.mag === 0 || (!visible && now - this.lastSeen > 1.5 && am.mag < 10)) inp.reload = true;

    if (visible) {
      // celowanie: w klatkę albo w głowę, z błędem malejącym w czasie
      const aimAt = this.aimHead ? head : chest;
      const decay = Math.exp(-(now - this.noticedAt) * 2.2);
      const dx = aimAt[0] - eye[0], dy = aimAt[1] - eye[1], dz = aimAt[2] - eye[2];
      const wantYaw = Math.atan2(-dx, -dz) + this.errX * (0.25 + decay);
      const wantPitch = Math.atan2(dy, Math.hypot(dx, dz)) + this.errY * (0.25 + decay) - me.punch * 0.6;
      this.turnTo(wantYaw, wantPitch, dt);
      const off = Math.hypot(wrap(wantYaw - this.yaw), wantPitch - this.pitch);
      const ready = now - this.noticedAt > L.reaction && off < 0.05 + 0.4 / Math.max(dist, 1);
      if (ready && now >= this.pauseUntil) {
        if (this.burstLeft <= 0) {
          this.burstLeft = L.burst[0] + Math.floor(this.rnd() * (L.burst[1] - L.burst[0] + 1));
          this.aimHead = this.rnd() < L.headChance;
        }
        inp.fire = true;
        // pistolet trzeba „klikać”
        if (a.cur === 'pistol' && !a.released) inp.fire = false;
        if (now >= a.ready && inp.fire) { this.burstLeft--; if (this.burstLeft <= 0) this.pauseUntil = now + L.pause * (0.7 + this.rnd() * 0.6); }
        inp.walk = true; // stoi przy strzelaniu – celniej
        if (L.reaction < 0.3 && dist > 10 && this.rnd() < 0.002) inp.crouch = true;
      } else {
        // między seriami: krok w bok
        if (now > this.strafeUntil) { this.strafe = this.rnd() < 0.5 ? -1 : 1; this.strafeUntil = now + 0.4 + this.rnd() * 0.8; }
        inp.side = this.strafe;
        if (dist > 18) inp.fwd = 1;
      }
    } else {
      // szukanie: tam, gdzie widział gracza; gdy go słyszy (strzały, bieg w pobliżu) – w tamtą stronę;
      // inaczej obchodzi ciekawe miejsca, a pod koniec rundy idzie prosto na gracza
      const heard = now - foe.fired < 2.5 || (foe.speed > 3.2 && dist < 14) || d.match.until - now < 55;
      let goal: [number, number];
      if (this.lastPos && now - this.lastSeen < 5) goal = this.lastPos;
      else if (heard) goal = [foe.x, foe.z];
      else {
        if (!this.patrol || Math.hypot(this.patrol[0] - b.x, this.patrol[1] - b.z) < 1.2) {
          // najbliższy punkt jeszcze nieodwiedzony po stronie przeciwnika – bez cofania się
          const opts = PATROL.filter(p => p !== this.patrol && Math.hypot(p[0] - b.x, p[1] - b.z) > 3);
          opts.sort((p, q) => Math.hypot(p[0] - foe.x, p[1] - foe.z) - Math.hypot(q[0] - foe.x, q[1] - foe.z));
          this.patrol = opts[Math.floor(this.rnd() * Math.min(3, opts.length))] ?? null;
          this.path = []; this.repathAt = 0;
        }
        goal = this.patrol ?? [foe.x, foe.z];
      }
      if (now >= this.repathAt || !this.path.length) {
        this.path = findPath(nav(), b.x, b.z, goal[0], goal[1]) ?? [];
        this.repathAt = now + 1.2;
      }
      while (this.path.length && Math.hypot(this.path[0][0] - b.x, this.path[0][1] - b.z) < 0.45) this.path.shift();
      if (this.lastPos && Math.hypot(this.lastPos[0] - b.x, this.lastPos[1] - b.z) < 1) this.lastPos = null;
      const wp = this.path[0];
      if (wp) {
        // patrzy przed siebie (albo w stronę, gdzie słyszał przeciwnika, gdy jest blisko celu)
        this.turnTo(Math.atan2(-(wp[0] - b.x), -(wp[1] - b.z)), 0, dt);
        const dy = wrap(Math.atan2(-(wp[0] - b.x), -(wp[1] - b.z)) - this.yaw);
        inp.fwd = Math.cos(dy) > 0.3 ? 1 : 0;
        // utknął? podskok i nowa ścieżka
        if (Math.hypot(b.vx, b.vz) < 0.6 && inp.fwd) { this.stuckT += dt; if (this.stuckT > 0.6) { inp.jump = true; this.repathAt = 0; this.stuckT = 0; } }
        else this.stuckT = 0;
      }
    }
    inp.yaw = this.yaw; inp.pitch = this.pitch;
    return inp;
  }

  private turnTo(yaw: number, pitch: number, dt: number): void {
    const max = this.L.turn * dt;
    const dy = wrap(yaw - this.yaw);
    this.yaw = wrap(this.yaw + Math.max(-max, Math.min(max, dy)));
    this.pitch += Math.max(-max, Math.min(max, pitch - this.pitch));
  }
}

/** Do testów: czy z punktu da się dojść prosto. */
export const canWalk = (x0: number, z0: number, x1: number, z1: number) => walkable(nav(), x0, z0, x1, z1);
