// Broń: karabin i pistolet. Rozrzut rośnie w biegu, w powietrzu i przy ciągłym strzelaniu.

import type { V3 } from './ray';

export type WeaponId = 'rifle' | 'pistol';

export interface WeaponSpec {
  name: string;
  mag: number;
  reserve: number;
  /** sekundy między strzałami */
  interval: number;
  auto: boolean;
  dmg: number;
  headMul: number;
  reload: number;
  /** rozrzut w radianach: na stojąco, w ruchu, w powietrzu */
  spread: number; spreadMove: number; spreadAir: number;
  /** ile dokłada każdy strzał i jak szybko wraca (na sekundę) */
  bloom: number; bloomMax: number; bloomRecover: number;
  /** podrzut lufy na strzał (radiany) */
  kick: number;
  draw: number;
}

export const WEAPONS: Record<WeaponId, WeaponSpec> = {
  rifle: {
    name: 'Karabin', mag: 30, reserve: 90, interval: 0.1, auto: true, dmg: 34, headMul: 4, reload: 2.4,
    spread: 0.004, spreadMove: 0.05, spreadAir: 0.12, bloom: 0.009, bloomMax: 0.06, bloomRecover: 0.12, kick: 0.012, draw: 0.9,
  },
  pistol: {
    name: 'Pistolet', mag: 12, reserve: 36, interval: 0.16, auto: false, dmg: 27, headMul: 3.6, reload: 1.9,
    spread: 0.006, spreadMove: 0.03, spreadAir: 0.09, bloom: 0.016, bloomMax: 0.05, bloomRecover: 0.16, kick: 0.018, draw: 0.5,
  },
};

export const MAX_HP = 100;

export function damage(w: WeaponId, head: boolean, dist: number): number {
  const s = WEAPONS[w];
  const falloff = Math.max(0.75, 1 - Math.max(0, dist - 15) * 0.006);
  return Math.round(s.dmg * (head ? s.headMul : 1) * falloff);
}

export interface Ammo { mag: number; reserve: number }
export interface Arms {
  cur: WeaponId;
  ammo: Record<WeaponId, Ammo>;
  /** czas (s) od którego można strzelić */
  ready: number;
  /** kiedy kończy się przeładowanie (0 = nie przeładowuje) */
  reloadEnd: number;
  bloom: number;
  /** czy spust był puszczony od ostatniego strzału (pistolet) */
  released: boolean;
}

export const newArms = (): Arms => ({
  cur: 'rifle',
  ammo: { rifle: { mag: WEAPONS.rifle.mag, reserve: WEAPONS.rifle.reserve }, pistol: { mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve } },
  ready: 0, reloadEnd: 0, bloom: 0, released: true,
});

export function currentSpread(a: Arms, speed: number, onGround: boolean, crouch: boolean): number {
  const s = WEAPONS[a.cur];
  let sp = s.spread + a.bloom;
  if (!onGround) sp += s.spreadAir;
  else sp += s.spreadMove * Math.min(1, Math.max(0, speed - 1.3) / 3.6);
  return crouch ? sp * 0.75 : sp;
}

export function switchWeapon(a: Arms, w: WeaponId, now: number): boolean {
  if (a.cur === w) return false;
  a.cur = w; a.reloadEnd = 0; a.bloom = 0;
  a.ready = Math.max(a.ready, now + WEAPONS[w].draw);
  return true;
}

export function startReload(a: Arms, now: number): boolean {
  const am = a.ammo[a.cur], s = WEAPONS[a.cur];
  if (a.reloadEnd || am.mag >= s.mag || am.reserve <= 0) return false;
  a.reloadEnd = now + s.reload;
  return true;
}

/** Przebieg czasu: koniec przeładowania i powrót rozrzutu. */
export function tickArms(a: Arms, now: number, dt: number): boolean {
  a.bloom = Math.max(0, a.bloom - WEAPONS[a.cur].bloomRecover * dt);
  if (a.reloadEnd && now >= a.reloadEnd) {
    const am = a.ammo[a.cur], need = WEAPONS[a.cur].mag - am.mag, take = Math.min(need, am.reserve);
    am.mag += take; am.reserve -= take; a.reloadEnd = 0;
    return true;
  }
  return false;
}

/** Czy można teraz oddać strzał. Pusty magazynek z zapasem – zaczyna przeładowanie. */
export function tryFire(a: Arms, trigger: boolean, now: number): boolean {
  if (!trigger) { a.released = true; return false; }
  const s = WEAPONS[a.cur], am = a.ammo[a.cur];
  if (a.reloadEnd || now < a.ready) return false;
  if (!s.auto && !a.released) return false;
  if (am.mag <= 0) { startReload(a, now); return false; }
  am.mag--; a.released = false;
  a.ready = now + s.interval;
  a.bloom = Math.min(s.bloomMax, a.bloom + s.bloom);
  return true;
}

/** Losowe odchylenie kierunku w stożku o kącie `spread`. */
export function scatter(d: V3, spread: number, rnd: () => number): V3 {
  if (spread <= 0) return d;
  // dwa wektory prostopadłe do d
  const up: V3 = Math.abs(d[1]) < 0.95 ? [0, 1, 0] : [1, 0, 0];
  const r: V3 = norm(cross(d, up)), u: V3 = cross(r, d);
  const ang = rnd() * Math.PI * 2, rad = Math.sqrt(rnd()) * spread;
  const a = Math.cos(ang) * rad, b = Math.sin(ang) * rad;
  return norm([d[0] + r[0] * a + u[0] * b, d[1] + r[1] * a + u[1] * b, d[2] + r[2] * a + u[2] * b]);
}

const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (v: V3): V3 => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
