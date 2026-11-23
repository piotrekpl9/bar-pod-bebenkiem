// Automat 1v1: widok z pierwszej osoby, sterowanie, HUD i efekty.
// Rysuje tym samym rendererem co bar – na czas meczu przejmuje klatki (game-view → arenaFrame).

import * as THREE from 'three';
import { $, store } from '../ui/dom';
import { renderer, canvas } from '../view/scene';
import { BotBrain, BOT_LEVEL_NAMES, type BotLevel } from './bot';
import { Duel, IDLE, type DuelInput, type DuelMsg, type ShotInfo } from './duel';
import { MAP } from './map';
import { matchWinner, WIN_ROUNDS, type MatchState, type Side } from './match';
import { makeSoldier, makeViewModel, poseSoldier, type Soldier, type ViewModel } from './models';
import { lookDir, speedOf } from './physics';
import { clearLine, headCenter, rayMap, type V3 } from './ray';
import { ASFX } from './sfx';
import { WEAPONS, currentSpread, type WeaponId } from './weapons';
import { buildWorld, type World } from './world';

export interface ArenaStart {
  side: Side;
  myName: string;
  foeName: string;
  /** null = trening z botem */
  net: { send(m: DuelMsg): void } | null;
  bot?: BotLevel;
  /** wyjście z automatu (gracz sam wyszedł albo mecz się skończył i wrócił do baru) */
  onExit(): void;
}

export interface ArenaSession {
  receive(m: unknown): void;
  opponentLeft(): void;
  /** zamknięcie z zewnątrz (np. host zaczyna partię) */
  close(): void;
}

// ---------- zasoby tworzone przy pierwszym wejściu ----------
let world: World | null = null;
const cam = new THREE.PerspectiveCamera(72, 1, 0.03, 260);
cam.rotation.order = 'YXZ';
let soldiers: [Soldier, Soldier] | null = null;
const vms: Partial<Record<Side, ViewModel>> = {};

// efekty
interface Tracer { line: THREE.Line; until: number }
interface Puff { s: THREE.Sprite; t0: number; life: number; grow: number }
const tracers: Tracer[] = [];
const puffs: Puff[] = [];
let decals: THREE.Mesh[] = [];
let decalI = 0;

function ensureWorld(): World {
  if (world) return world;
  world = buildWorld();
  world.scene.add(cam);
  soldiers = [makeSoldier(0), makeSoldier(1)];
  for (const s of soldiers) { s.root.visible = false; world.scene.add(s.root); }
  // smugi pocisków
  const trM = new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  for (let i = 0; i < 16; i++) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(g, trM); line.visible = false; line.frustumCulled = false; world.scene.add(line);
    tracers.push({ line, until: 0 });
  }
  // dziury po kulach
  const holeTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d')!;
    const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(10,8,6,1)'); gr.addColorStop(0.35, 'rgba(30,22,15,.9)'); gr.addColorStop(1, 'rgba(60,45,30,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
    return new THREE.CanvasTexture(c);
  })();
  const holeM = new THREE.MeshBasicMaterial({ map: holeTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  decals = Array.from({ length: 60 }, () => { const d = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.11), holeM); d.visible = false; world!.scene.add(d); return d; });
  // kurz / krew
  const puffTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!;
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  for (let i = 0; i < 24; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false }));
    s.visible = false; world.scene.add(s); puffs.push({ s, t0: 0, life: 0, grow: 1 });
  }
  return world;
}
const vmFor = (side: Side): ViewModel => (vms[side] ??= makeViewModel(side));

// ---------- stan sesji ----------
interface Runtime {
  o: ArenaStart;
  duel: Duel;
  bot: { duel: Duel; brain: BotBrain; toBot: DuelMsg[]; toMe: DuelMsg[] } | null;
  last: number;
  t: number;
  yaw: number; pitch: number;
  keys: Set<string>;
  mouse: boolean;
  wantWeapon: WeaponId | null;
  wantReload: boolean;
  kick: number; flashUntil: number; drawFrom: number;
  stepT: number; foeStepT: number;
  hurtUntil: number; hitUntil: number; headHit: boolean;
  deadT: number;
  prevWeapon: WeaponId;
  wasGround: boolean;
  countdown: number;
  closed: boolean;
  /** zegar gry (w treningu zatrzymuje się na pauzie) */
  clock: number;
}
let R: Runtime | null = null;

export const inArena = (): boolean => !!R;

// ---------- HUD ----------
const hud = {
  root: () => $('#arena'),
  msg(t: string, sub = '') { $('#arMsg').textContent = t; $('#arSub').textContent = sub; },
};

function sens(): number { const v = Number(store.get('bpb-sens') ?? 1); return Number.isFinite(v) && v > 0 ? v : 1; }

// ---------- wejście / wyjście ----------
export function enterArena(o: ArenaStart): ArenaSession {
  if (R) closeRuntime();
  ensureWorld();
  const now = performance.now() / 1000;
  const run: Runtime = {
    o, duel: null as unknown as Duel, bot: null, last: performance.now(), t: now,
    yaw: 0, pitch: 0, keys: new Set(), mouse: false, wantWeapon: null, wantReload: false,
    kick: 0, flashUntil: 0, drawFrom: now, stepT: 0, foeStepT: 0, hurtUntil: 0, hitUntil: 0, headHit: false, deadT: 0,
    prevWeapon: 'rifle', wasGround: true, countdown: -1, closed: false, clock: now,
  };
  R = run;
  const hooks = (forMe: boolean) => ({
    send: (m: DuelMsg) => {
      if (!forMe) { run.bot!.toMe.push(m); return; }
      if (run.bot) run.bot.toBot.push(m); else o.net?.send(m);
    },
    ...(forMe ? {
      shot: (s: ShotInfo) => onShot(run, s),
      hurt: (dmg: number, head: boolean, from: V3) => onHurt(run, dmg, head, from),
      hitConfirm: (head: boolean, kill: boolean) => { run.hitUntil = run.t + (kill ? 0.45 : 0.2); run.headHit = head || kill; if (head) ASFX.head(); else ASFX.hit(); },
      phase: (m: MatchState, prev: MatchState | null) => onPhase(run, m, prev),
      reloaded: () => {},
      left: () => {},
    } : {}),
  });
  run.duel = new Duel(o.side, hooks(true), now);
  if (!o.net) {
    const level = o.bot ?? 'normal';
    run.bot = { duel: null as unknown as Duel, brain: new BotBrain(level), toBot: [], toMe: [] };
    run.bot.duel = new Duel((1 - o.side) as Side, hooks(false), now);
  }
  run.yaw = run.duel.me.yaw; run.pitch = 0;
  // widok
  const [s0, s1] = soldiers!;
  s0.root.visible = o.side === 1; s1.root.visible = o.side === 0;
  for (const side of [0, 1] as Side[]) { const v = vms[side]; if (v) v.root.visible = false; }
  vmFor(o.side).root.visible = true;
  document.body.classList.add('in-arena');
  hud.root().classList.remove('hide');
  $('#arOver').classList.add('hide');
  $('#arFoe').textContent = o.foeName;
  $('#arMe').textContent = o.myName;
  $('#arVs').textContent = o.net ? `Pojedynek z: ${o.foeName}` : `Trening z botem (${BOT_LEVEL_NAMES[o.bot ?? 'normal']})`;
  $<HTMLInputElement>('#arSens').value = String(sens());
  renderer.toneMappingExposure = 1.0;
  showPause(true);
  bindInput();
  return {
    receive: (m: unknown) => { if (R === run) run.duel.receive(m, run.t); },
    opponentLeft: () => { if (R === run) run.duel.opponentLeft(run.t); },
    close: () => { if (R === run) closeRuntime(); },
  };
}

function closeRuntime(): void {
  if (!R) return;
  R.closed = true;
  R = null;
  if (document.pointerLockElement) document.exitPointerLock();
  document.body.classList.remove('in-arena');
  hud.root().classList.add('hide');
  renderer.toneMappingExposure = 1.15;
}

/** Gracz wychodzi z automatu. */
export function leaveArena(): void {
  const r = R;
  if (!r) return;
  if (!r.duel.ended) r.duel.quit();
  closeRuntime();
  r.o.onExit();
}

/** Trening: od nowa z tym samym botem. */
function restartBot(): void {
  const r = R;
  if (!r || r.o.net) return;
  enterArena(r.o);
}

// ---------- sterowanie ----------
let inputBound = false;
function bindInput(): void {
  if (inputBound) return;
  inputBound = true;
  const locked = () => document.pointerLockElement === canvas;
  document.addEventListener('pointerlockchange', () => {
    if (!R) return;
    if (!locked()) { R.keys.clear(); R.mouse = false; showPause(true); }
    else showPause(false);
  });
  document.addEventListener('mousemove', e => {
    if (!R || !locked()) return;
    const k = 0.0022 * sens();
    R.yaw -= e.movementX * k;
    R.pitch = Math.max(-1.45, Math.min(1.45, R.pitch - e.movementY * k));
  });
  canvas.addEventListener('mousedown', e => {
    if (!R) return;
    if (!locked()) { lock(); return; }
    if (e.button === 0) R.mouse = true;
  });
  document.addEventListener('mouseup', e => { if (R && e.button === 0) R.mouse = false; });
  document.addEventListener('wheel', e => { if (R && locked()) R.wantWeapon = R.duel.me.arms.cur === 'rifle' ? 'pistol' : 'rifle'; void e; }, { passive: true });
  window.addEventListener('keydown', e => {
    if (!R || !locked()) return;
    const c = e.code;
    R.keys.add(c);
    if (c === 'Digit1') R.wantWeapon = 'rifle';
    if (c === 'Digit2') R.wantWeapon = 'pistol';
    if (c === 'KeyQ') R.wantWeapon = R.duel.me.arms.cur === 'rifle' ? 'pistol' : 'rifle';
    if (c === 'KeyR') R.wantReload = true;
    if (['Space', 'Tab'].includes(c)) e.preventDefault();
  });
  window.addEventListener('keyup', e => { R?.keys.delete(e.code); });
  window.addEventListener('blur', () => { if (R) { R.keys.clear(); R.mouse = false; } });
  $('#arPlay').addEventListener('click', lock);
  $('#arQuit').addEventListener('click', leaveArena);
  $('#arBack').addEventListener('click', leaveArena);
  $('#arAgain').addEventListener('click', restartBot);
  $<HTMLInputElement>('#arSens').addEventListener('input', e => store.set('bpb-sens', (e.target as HTMLInputElement).value));
}

function lock(): void {
  try {
    const p = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
    if (p && typeof p.catch === 'function') p.catch(() => { /* przeglądarka odmówiła – zostaje pauza */ });
  } catch { /* brak wsparcia */ }
}

function showPause(on: boolean): void {
  if (!R) return;
  const over = R.duel.ended && R.duel.match.phase === 'over';
  $('#arPause').classList.toggle('hide', !on || over);
}

function readInput(r: Runtime): DuelInput {
  const k = r.keys, has = (...c: string[]) => c.some(x => k.has(x));
  const inp: DuelInput = {
    ...IDLE,
    fwd: (has('KeyW', 'ArrowUp') ? 1 : 0) - (has('KeyS', 'ArrowDown') ? 1 : 0),
    side: (has('KeyD', 'ArrowRight') ? 1 : 0) - (has('KeyA', 'ArrowLeft') ? 1 : 0),
    jump: has('Space'),
    crouch: has('KeyC', 'ControlLeft'),
    walk: has('ShiftLeft', 'ShiftRight'),
    yaw: r.yaw, pitch: r.pitch,
    fire: r.mouse,
    reload: r.wantReload,
    weapon: r.wantWeapon,
  };
  r.wantReload = false; r.wantWeapon = null;
  return inp;
}

// ---------- zdarzenia pojedynku ----------
function onShot(r: Runtime, s: ShotInfo): void {
  const mine = s.side === r.o.side;
  const dist = Math.hypot(s.o[0] - cam.position.x, s.o[2] - cam.position.z);
  const vol = mine ? 1 : Math.max(0.12, 1 / (1 + dist / 10));
  if (s.w === 'rifle') ASFX.rifle(vol); else ASFX.pistol(vol);
  // smuga: u mnie od lufy (trochę w prawo i w dół od oczu)
  let o: V3 = s.o;
  if (mine) {
    const d = lookDir(r.yaw, r.pitch);
    const right: V3 = [Math.cos(r.yaw), 0, -Math.sin(r.yaw)];
    o = [s.o[0] + d[0] * 0.7 + right[0] * 0.16, s.o[1] + d[1] * 0.7 - 0.13, s.o[2] + d[2] * 0.7 + right[2] * 0.16];
    r.kick = 1; r.flashUntil = r.t + 0.045;
  }
  if (Math.random() < (mine ? 0.5 : 0.8)) tracer(o, s.e, r.t);
  // ślad na ścianie
  let normal = s.normal, hitWall = s.hit === 'wall' || s.hit === 'ground';
  if (!mine) {
    const d: V3 = [s.e[0] - s.o[0], s.e[1] - s.o[1], s.e[2] - s.o[2]];
    const len = Math.hypot(d[0], d[1], d[2]) || 1;
    const h = rayMap(s.o, [d[0] / len, d[1] / len, d[2] / len], len + 0.05, MAP);
    hitWall = !!h && Math.abs(h.t - len) < 0.1; normal = h?.normal ?? null;
  }
  if (hitWall && normal) {
    decal(s.e, normal);
    puff([s.e[0] + normal[0] * 0.05, s.e[1] + normal[1] * 0.05, s.e[2] + normal[2] * 0.05], 0xd9c39a, r.t, 0.5, 0.25);
  }
  if (mine && s.hit === 'player') puff(s.e, 0xa01818, r.t, 0.35, 0.2);
}

function onHurt(r: Runtime, dmg: number, head: boolean, from: V3): void {
  r.hurtUntil = r.t + 0.5;
  ASFX.hurt();
  // kierunek, z którego padł strzał
  const me = r.duel.me.body;
  const ang = Math.atan2(-(from[0] - me.x), -(from[2] - me.z)) - r.yaw;
  $('#arDir').style.transform = `translate(-50%,-50%) rotate(${-ang}rad)`;
  $('#arDir').classList.remove('show'); void $('#arDir').offsetWidth; $('#arDir').classList.add('show');
  void dmg; void head;
}

function onPhase(r: Runtime, m: MatchState, prev: MatchState | null): void {
  const mySide = r.o.side, foe = r.o.foeName;
  if (m.phase === 'freeze') {
    // r.duel jest pusty, gdy faza przychodzi jeszcze z konstruktora pojedynku
    if (r.duel) { r.yaw = r.duel.me.yaw; r.pitch = 0; }
    r.deadT = 0; r.drawFrom = r.t;
    hud.msg(`Runda ${m.round}`, `${m.score[mySide]} : ${m.score[1 - mySide]}`);
    r.countdown = -1;
  } else if (m.phase === 'live') {
    hud.msg('Walcz!'); ASFX.go();
    setTimeout(() => { if (R === r && r.duel.match.phase === 'live') hud.msg(''); }, 900);
  } else if (m.phase === 'end' || m.phase === 'over') {
    const w = m.last;
    const how = m.how === 'time' ? 'Koniec czasu – wygrywa ten, kto ma więcej zdrowia.' : '';
    if (m.phase === 'end') {
      if (w === mySide) { hud.msg('Wygrywasz rundę!', how); }
      else if (w === -1) hud.msg('Remis', 'Nikt nie dostaje punktu.');
      else hud.msg(`${foe} wygrywa rundę`, how);
    }
    if (m.phase === 'over') {
      hud.msg('');
      const win = matchWinner(m) === mySide;
      if (win) ASFX.win(); else ASFX.lose();
      $('#arOverTitle').textContent = win ? 'Wygrana!' : 'Przegrana';
      $('#arOverScore').textContent = `${m.score[mySide]} : ${m.score[1 - mySide]}`;
      $('#arOverText').textContent = m.how === 'quit'
        ? (win ? `${foe} opuszcza automat. Wygrywasz walkowerem.` : 'Wyszedłeś z automatu.')
        : win ? `Pokonujesz ${foe} w meczu do ${WIN_ROUNDS} wygranych.` : `${foe} wygrywa mecz do ${WIN_ROUNDS} wygranych.`;
      $('#arAgain').classList.toggle('hide', !!r.o.net);
      $('#arOver').classList.remove('hide');
      $('#arPause').classList.add('hide');
      if (document.pointerLockElement) document.exitPointerLock();
    }
  }
  void prev;
}

// ---------- efekty ----------
function tracer(a: V3, b: V3, t: number): void {
  const tr = tracers.find(x => x.until < t) ?? tracers[0];
  const p = tr.line.geometry.attributes.position as THREE.BufferAttribute;
  // krótki odcinek bliżej celu wygląda jak lecąca kula
  const k = 0.35;
  p.setXYZ(0, a[0] + (b[0] - a[0]) * k * 0.2, a[1] + (b[1] - a[1]) * k * 0.2, a[2] + (b[2] - a[2]) * k * 0.2);
  p.setXYZ(1, b[0], b[1], b[2]);
  p.needsUpdate = true;
  tr.line.visible = true; tr.until = t + 0.06;
}

function decal(p: V3, n: V3): void {
  const d = decals[decalI++ % decals.length];
  d.position.set(p[0] + n[0] * 0.012, p[1] + n[1] * 0.012, p[2] + n[2] * 0.012);
  d.lookAt(p[0] + n[0], p[1] + n[1], p[2] + n[2]);
  d.rotation.z = Math.random() * 6;
  d.visible = true;
}

function puff(p: V3, color: number, t: number, life: number, size: number): void {
  const f = puffs.find(x => t - x.t0 > x.life) ?? puffs[0];
  f.s.position.set(p[0], p[1], p[2]);
  f.s.material.color.setHex(color);
  f.t0 = t; f.life = life; f.grow = size;
  f.s.visible = true;
}

// ---------- klatka ----------
const tmpV = new THREE.Vector3();
let lastW = 0, lastH = 0;

/** Wołane przez pętlę gry. Zwraca true, gdy arena przejęła klatkę. */
export function arenaFrame(nowMs: number): boolean {
  const r = R;
  if (!r || !world) return false;
  const locked = document.pointerLockElement === canvas;
  const realDt = Math.min(0.05, Math.max(0, (nowMs - r.last) / 1000));
  r.last = nowMs;
  // trening z botem stoi na pauzie; mecz z człowiekiem trwa dalej
  const paused = !r.o.net && !locked;
  const dt = paused ? 0 : realDt;
  r.clock += dt;
  const t = r.o.net ? nowMs / 1000 : r.clock; r.t = t;
  const d = r.duel;

  // bot (trening)
  if (r.bot) {
    const b = r.bot;
    while (b.toBot.length) b.duel.receive(b.toBot.shift(), t);
    b.duel.update(t, dt, b.brain.think(b.duel, t, dt));
    while (b.toMe.length) d.receive(b.toMe.shift(), t);
  }
  const inp = locked ? readInput(r) : { ...IDLE, yaw: r.yaw, pitch: r.pitch };
  d.update(t, dt, inp);

  const me = d.me, body = me.body;
  // kamera
  if (canvas.clientWidth !== lastW || canvas.clientHeight !== lastH) {
    lastW = canvas.clientWidth; lastH = canvas.clientHeight;
    cam.aspect = lastW / Math.max(1, lastH); cam.updateProjectionMatrix();
  }
  let eyeY = body.y + body.eye;
  if (!me.alive) { r.deadT = Math.min(1, r.deadT + dt * 2); eyeY = body.y + body.eye * (1 - r.deadT * 0.8); }
  cam.position.set(body.x, eyeY, body.z);
  cam.rotation.set(r.pitch + me.punch * 0.6, r.yaw, me.alive ? 0 : r.deadT * 0.5);

  // dźwięk kroków
  const sp = speedOf(body);
  if (body.onGround && sp > 3.2 && me.alive) { r.stepT -= dt; if (r.stepT <= 0) { ASFX.step(0.8); r.stepT = 0.36; } }
  if (body.onGround && !r.wasGround) ASFX.land();
  r.wasGround = body.onGround;

  // przeciwnik
  const foe = d.foe, sol = soldiers![(1 - r.o.side) as Side];
  poseSoldier(sol, { ...foe, weapon: foe.weapon }, dt);
  const fd = Math.hypot(foe.x - body.x, foe.z - body.z);
  if (foe.alive && foe.speed > 3.2) { r.foeStepT -= dt; if (r.foeStepT <= 0) { r.foeStepT = 0.36; if (fd < 22) ASFX.step(Math.max(0.1, 1 - fd / 22)); } }
  // podpis nad głową, gdy go widać
  const tag = $('#arTag');
  const hc = headCenter(foe);
  const visible = foe.alive && clearLine([cam.position.x, cam.position.y, cam.position.z], hc, MAP);
  tmpV.set(hc[0], hc[1] + 0.35, hc[2]).project(cam);
  if (visible && tmpV.z < 1 && Math.abs(tmpV.x) < 1.1 && Math.abs(tmpV.y) < 1.1) {
    tag.style.display = '';
    tag.style.left = `${(tmpV.x * 0.5 + 0.5) * window.innerWidth}px`;
    tag.style.top = `${(-tmpV.y * 0.5 + 0.5) * window.innerHeight}px`;
  } else tag.style.display = 'none';

  // efekty
  for (const tr of tracers) if (tr.line.visible && tr.until < t) tr.line.visible = false;
  for (const f of puffs) {
    if (!f.s.visible) continue;
    const k = (t - f.t0) / f.life;
    if (k >= 1) { f.s.visible = false; continue; }
    f.s.scale.setScalar(f.grow * (0.4 + k * 1.6));
    f.s.material.opacity = (1 - k) * 0.7;
  }

  // broń w ręce
  const vm = vmFor(r.o.side);
  const a = me.arms, spec = WEAPONS[a.cur];
  if (a.cur !== r.prevWeapon) { r.prevWeapon = a.cur; r.drawFrom = t; ASFX.draw(); }
  vm.guns.rifle.visible = a.cur === 'rifle'; vm.guns.pistol.visible = a.cur === 'pistol';
  const g = vm.guns[a.cur];
  r.kick *= Math.exp(-dt * 14);
  const bob = body.onGround ? Math.min(1, sp / 5) : 0;
  const phase = t * 9;
  let dip = 0;
  if (a.reloadEnd > t) { const p = 1 - (a.reloadEnd - t) / spec.reload; dip = Math.sin(Math.min(1, p) * Math.PI); }
  const draw = Math.max(0, 1 - (t - r.drawFrom) / Math.min(spec.draw, 0.6));
  vm.root.position.set(Math.cos(phase / 2) * 0.012 * bob, -Math.abs(Math.sin(phase / 2)) * 0.012 * bob - draw * 0.25 - (body.crouch ? 0.01 : 0), r.kick * 0.05);
  vm.root.rotation.set(r.kick * 0.08 - dip * 0.55 - draw * 0.6, dip * 0.35, dip * 0.3);
  vm.root.visible = me.alive;
  if (t < r.flashUntil && me.alive) {
    vm.flash.visible = true;
    vm.flash.position.copy(vm.muzzle[a.cur]).add(vm.root.position);
    vm.flash.material.rotation = Math.random() * 6;
  } else vm.flash.visible = false;
  void g;

  // HUD
  const m = d.match, my = r.o.side;
  $('#arScoreMe').textContent = String(m.score[my]);
  $('#arScoreFoe').textContent = String(m.score[1 - my]);
  const left = Math.max(0, m.until - t);
  $('#arClock').textContent = m.phase === 'live' ? `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}` : m.phase === 'freeze' ? `${Math.ceil(left)}` : '';
  if (m.phase === 'freeze') {
    const c = Math.ceil(left);
    if (c !== r.countdown && c > 0) { r.countdown = c; ASFX.beep(); $('#arSub').textContent = `Start za ${c}…`; }
  }
  $('#arHpN').textContent = String(me.alive ? me.hp : 0);
  $('#arHp').classList.toggle('low', me.hp <= 30);
  const am = a.ammo[a.cur];
  $('#arWeapon').textContent = spec.name;
  $('#arMag').textContent = a.reloadEnd > t ? '…' : String(am.mag);
  $('#arRes').textContent = String(am.reserve);
  // celownik rozchodzi się przy rozrzucie
  const spread = currentSpread(a, sp, body.onGround, body.crouch);
  const gap = 4 + (spread / Math.tan((cam.fov * Math.PI) / 360)) * (window.innerHeight / 2);
  $('#arCross').style.setProperty('--gap', `${Math.min(60, gap)}px`);
  $('#arCross').classList.toggle('hide', !me.alive);
  $('#arHit').classList.toggle('show', t < r.hitUntil);
  $('#arHit').classList.toggle('head', r.headHit);
  $('#arHurt').style.opacity = String(Math.max(0, (r.hurtUntil - t) / 0.5) * 0.7 + (me.alive && me.hp <= 30 ? 0.18 : 0));
  if (!me.alive && m.phase === 'live') hud.msg('Nie żyjesz', 'Czekaj na następną rundę.');

  // rysowanie: świat, potem broń na wierzchu (nie wchodzi w ściany)
  vm.cam.aspect = cam.aspect; vm.cam.updateProjectionMatrix();
  renderer.autoClear = true;
  renderer.render(world.scene, cam);
  renderer.autoClear = false;
  renderer.clearDepth();
  renderer.render(vm.scene, vm.cam);
  renderer.autoClear = true;
  return true;
}
