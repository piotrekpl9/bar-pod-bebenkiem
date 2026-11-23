// Ruch gracza na arenie: chodzenie, skok, kucanie, wchodzenie na stopnie i ślizganie się po ścianach.
// Gracz to pionowy prostopadłościan (promień RADIUS, wysokość h) stojący stopami w (x, y, z).

import type { Box } from './map';

export const RADIUS = 0.33;
export const STAND_H = 1.8, CROUCH_H = 1.25;
export const EYE_STAND = 1.64, EYE_CROUCH = 1.1;
/** Najwyższy stopień, na który wchodzi się bez skakania. */
export const STEP = 0.45;
export const GRAVITY = 18, JUMP_V = 6.1;
export const RUN = 5.4, WALK = 2.7, CROUCH_SPEED = 2.1;
const ACCEL = 60, AIR_ACCEL = 9, FRICTION = 10;
const EPS = 1e-4;

export interface Body {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  onGround: boolean;
  crouch: boolean;
  /** wysokość oczu – płynnie przechodzi przy kucaniu */
  eye: number;
}

export interface MoveInput {
  /** −1..1: do przodu / do tyłu */
  fwd: number;
  /** −1..1: w prawo / w lewo */
  side: number;
  jump: boolean;
  crouch: boolean;
  walk: boolean;
  yaw: number;
}

export const NO_INPUT: Omit<MoveInput, 'yaw'> = { fwd: 0, side: 0, jump: false, crouch: false, walk: false };

export const newBody = (x: number, z: number, y = 0): Body => ({ x, y, z, vx: 0, vy: 0, vz: 0, onGround: true, crouch: false, eye: EYE_STAND });

export const bodyH = (b: Body): number => (b.crouch ? CROUCH_H : STAND_H);

/** Kierunek patrzenia z kątów (yaw = 0 → −z, pitch > 0 → w górę). */
export function lookDir(yaw: number, pitch: number): [number, number, number] {
  const c = Math.cos(pitch);
  return [-Math.sin(yaw) * c, Math.sin(pitch), -Math.cos(yaw) * c];
}

/** Pierwsze pudełko kolidujące z graczem w podanym miejscu. */
export function overlap(x: number, y: number, z: number, h: number, boxes: readonly Box[]): Box | null {
  for (const b of boxes) {
    if (x + RADIUS <= b.x0 + EPS || x - RADIUS >= b.x1 - EPS) continue;
    if (z + RADIUS <= b.z0 + EPS || z - RADIUS >= b.z1 - EPS) continue;
    if (y + h <= b.y0 + EPS || y >= b.y1 - EPS) continue;
    return b;
  }
  return null;
}

/** Najwyższy wierzch pudełek pod stopami (do lądowania i wchodzenia na stopnie). */
function topUnder(x: number, y: number, z: number, h: number, boxes: readonly Box[]): number {
  let top = -Infinity;
  for (const b of boxes) {
    if (x + RADIUS <= b.x0 + EPS || x - RADIUS >= b.x1 - EPS) continue;
    if (z + RADIUS <= b.z0 + EPS || z - RADIUS >= b.z1 - EPS) continue;
    if (y + h <= b.y0 + EPS || y >= b.y1 - EPS) continue;
    top = Math.max(top, b.y1);
  }
  return top;
}

function moveAxis(b: Body, axis: 'x' | 'z', d: number, h: number, boxes: readonly Box[]): void {
  if (!d) return;
  const nx = axis === 'x' ? b.x + d : b.x, nz = axis === 'z' ? b.z + d : b.z;
  const hit = overlap(nx, b.y, nz, h, boxes);
  if (!hit) { b.x = nx; b.z = nz; return; }
  // stopień: jeśli przeszkoda jest niska, wchodzimy na nią
  if (b.onGround) {
    const top = topUnder(nx, b.y, nz, h, boxes);
    if (top - b.y <= STEP && !overlap(nx, top + EPS, nz, h, boxes) && !overlap(b.x, top + EPS, b.z, h, boxes)) {
      b.x = nx; b.z = nz; b.y = top + EPS; return;
    }
  }
  // dosuwamy do ściany i zerujemy prędkość w tej osi
  if (axis === 'x') { b.x = d > 0 ? hit.x0 - RADIUS - EPS * 2 : hit.x1 + RADIUS + EPS * 2; b.vx = 0; }
  else { b.z = d > 0 ? hit.z0 - RADIUS - EPS * 2 : hit.z1 + RADIUS + EPS * 2; b.vz = 0; }
}

/** Jeden krok symulacji. Długie klatki dzielimy na krótsze, żeby nie przelatywać przez ściany. */
export function stepBody(b: Body, inp: MoveInput, dt: number, boxes: readonly Box[], frozen = false): void {
  let left = Math.min(dt, 0.25);
  while (left > 1e-6) {
    const h = Math.min(left, 1 / 90);
    step(b, frozen ? { ...inp, ...NO_INPUT } : inp, h, boxes);
    left -= h;
  }
}

function step(b: Body, inp: MoveInput, dt: number, boxes: readonly Box[]): void {
  // kucanie: wstać można tylko, gdy nad głową jest miejsce
  if (inp.crouch) b.crouch = true;
  else if (b.crouch && !overlap(b.x, b.y, b.z, STAND_H, boxes)) b.crouch = false;
  const targetEye = b.crouch ? EYE_CROUCH : EYE_STAND;
  b.eye += (targetEye - b.eye) * Math.min(1, dt * 14);
  const h = bodyH(b);

  // kierunek ruchu z klawiszy
  let fx = 0, fz = 0;
  if (inp.fwd || inp.side) {
    const s = Math.sin(inp.yaw), c = Math.cos(inp.yaw);
    fx = -s * inp.fwd + c * inp.side;
    fz = -c * inp.fwd - s * inp.side;
    const l = Math.hypot(fx, fz); fx /= l; fz /= l;
  }
  const max = b.crouch ? CROUCH_SPEED : inp.walk ? WALK : RUN;

  if (b.onGround) {
    // tarcie
    const sp = Math.hypot(b.vx, b.vz);
    if (sp > 0) {
      const drop = Math.max(sp - FRICTION * Math.max(sp, 1.5) * dt, 0) / sp;
      b.vx *= drop; b.vz *= drop;
    }
    accelerate(b, fx, fz, max, ACCEL, dt);
    if (inp.jump) { b.vy = JUMP_V; b.onGround = false; }
  } else {
    accelerate(b, fx, fz, max, AIR_ACCEL, dt);
  }

  moveAxis(b, 'x', b.vx * dt, h, boxes);
  moveAxis(b, 'z', b.vz * dt, h, boxes);

  // pion
  b.vy -= GRAVITY * dt;
  const ny = b.y + b.vy * dt;
  if (ny <= 0) { b.y = 0; b.vy = 0; b.onGround = true; return; }
  const hit = overlap(b.x, ny, b.z, h, boxes);
  if (hit) {
    if (b.vy < 0) { b.y = topUnder(b.x, ny, b.z, h, boxes) + EPS; b.onGround = true; }
    else b.y = Math.min(b.y, hit.y0 - h - EPS);
    b.vy = 0;
    return;
  }
  b.y = ny;
  // czy wciąż coś trzyma nas od spodu (żeby nie „spadać” z prędkością przy zejściu ze stopnia)
  b.onGround = b.y <= EPS * 2 || !!overlap(b.x, b.y - 0.02, b.z, h, boxes);
  if (b.onGround && b.vy < 0) b.vy = 0;
}

function accelerate(b: Body, fx: number, fz: number, max: number, accel: number, dt: number): void {
  if (!fx && !fz) return;
  const cur = b.vx * fx + b.vz * fz;
  const add = Math.min(Math.max(max - cur, 0), accel * max * dt * 0.2);
  b.vx += fx * add; b.vz += fz * add;
}

/** Prędkość pozioma. */
export const speedOf = (b: Body): number => Math.hypot(b.vx, b.vz);
