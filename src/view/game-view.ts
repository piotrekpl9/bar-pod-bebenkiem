// Widok partii: odtwarza zdarzenia od hosta jako animacje 3D i HUD.
// Każdy gracz (także host) ma własny widok; host dodatkowo prowadzi silnik (src/net/host.ts).

import * as THREE from 'three';
import { KINDS } from '../core/constants';
import { fromCanonical, gazeChanged, toCanonical, type Gaze } from '../core/gaze';
import { isTruthful } from '../core/rules';
import { FULL, RELIEF, SPECIAL_DESC, cardLabel, claimText, deckDesc } from '../core/text';
import type { Card, GameEvent, Kind, Mode, PublicSeat, PublicState, Rank, TableSize, ViewEvent } from '../core/types';
import { $, esc, hideScreens, sleep } from '../ui/dom';
import { SFX, initAudio } from './audio';
import { GUN_REST_POS, GUN_REST_Q, fanGeo, fanMat, gun, layoutState, makeCharacter, seatPos, type Character } from './characters';
import { PILE_Y, bulb, camera, canvas, dustGeo, dustN, mat, renderer, scene, shade, spot, tableTop, tableY } from './scene';
import { CARD_COL, backTex, faceTex } from './textures';
import { anim, easeOutCubic, moveObj, stepTweens } from './tweens';

type TurnEv = Extract<GameEvent, { t: 'turn' }>;
export type PlayerAction = { t: 'play'; idx: number[] } | { t: 'liar' };

// ---------- stan widoku ----------
export const V = {
  mySeat: 0,
  size: 4 as TableSize,
  mode: 'classic' as Mode,
  seats: [] as PublicState,
  table: 'K' as Rank,
  active: -1,
  turn: null as TurnEv | null,
  myHand: [] as Card[],
  deadline: 0,
};
const sel = new Set<number>();
let lastMeshes: THREE.Mesh[] = [];
let pileH = 0;
let shake = 0;

let sendAction: (a: PlayerAction) => void = () => {};
let sendLook: (g: Gaze) => void = () => {};
let onEnd: (ev: Extract<GameEvent, { t: 'end' }>) => void = () => {};
export function bindView(opts: { send: (a: PlayerAction) => void; look: (g: Gaze) => void; end: (ev: Extract<GameEvent, { t: 'end' }>) => void }): void {
  sendAction = opts.send; sendLook = opts.look; onEnd = opts.end;
}

// ---------- spojrzenia innych graczy ----------
const gazes = new Map<number, { g: Gaze; t: number }>();
/** Gdzie patrzy gracz na miejscu `seat` (przychodzi z sieci). */
export function setGaze(seat: number, g: Gaze): void { gazes.set(seat, { g, t: performance.now() }); }
const GAZE_FRESH_MS = 8000;
export function setMySeat(seat: number): void { V.mySeat = seat; }

const vIdx = (s: number) => (s - V.mySeat + V.size) % V.size;
const seatName = (s: number) => (s === V.mySeat ? 'Ty' : V.seats[s]?.name ?? '?');
const isTrue = (c: Card) => isTruthful(c, V.table);

// ---------- postacie i podpisy ----------
// Jeden model na postać; przy stole każda postać siedzi najwyżej raz, a miejsce wynika z wyboru gracza.
const models = Object.fromEntries(KINDS.map(k => {
  const c = makeCharacter(k); c.root.visible = false; scene.add(c.root); return [k, c];
})) as Record<Kind, Character>;
/** Model postaci siedzącej na miejscu `i` (null = puste miejsce). */
const charAt = (i: number): Character | null => { const s = V.seats[i]; return s ? models[s.kind] : null; };
interface Label { el: HTMLDivElement; bubble: HTMLDivElement; name: HTMLDivElement; stats: HTMLDivElement; timer?: number }
const labels: Label[] = KINDS.map(() => {
  const el = document.createElement('div'); el.className = 'label'; el.style.display = 'none';
  el.innerHTML = '<div class="bubble"></div><div class="name"></div><div class="stats"></div>';
  $('#labels').appendChild(el);
  const q = (s: string) => el.querySelector<HTMLDivElement>(s)!;
  return { el, bubble: q('.bubble'), name: q('.name'), stats: q('.stats') };
});
const HUMAN_CARD_ORIGIN = new THREE.Vector3(0, 1.05, 1.55);

// ---------- karty 3D ----------
const pileGroup = new THREE.Group(); scene.add(pileGroup);
const faceMats = {} as Record<Card, THREE.MeshStandardMaterial>;
(['K', 'Q', 'A', 'J', 'D', 'M', 'X'] as Card[]).forEach(t => { faceMats[t] = new THREE.MeshStandardMaterial({ map: faceTex(t), roughness: 0.6 }); });
const backMat = new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.6 });
const edgeMat = mat(0xd8ccb0);
const cardGeo = new THREE.BoxGeometry(0.3, 0.006, 0.42);
/** Zakryta karta ma rewers z OBU stron. Twarz pojawia się dopiero przy odkryciu. */
function makeCard3D(): THREE.Mesh {
  const m = new THREE.Mesh(cardGeo, [edgeMat, edgeMat, backMat, backMat, edgeMat, edgeMat]);
  m.castShadow = true; m.receiveShadow = true; return m;
}
function setFace(m: THREE.Mesh, c: Card): void { (m.material as THREE.Material[])[3] = faceMats[c] ?? faceMats.K; }
function clearPile(): void {
  while (pileGroup.children.length) pileGroup.remove(pileGroup.children[0]);
  pileH = 0; lastMeshes = [];
}
function pileSpot(): THREE.Vector3 {
  const v = new THREE.Vector3((Math.random() - 0.5) * 0.28, PILE_Y + 0.004 + pileH, (Math.random() - 0.5) * 0.28 - 0.05);
  pileH += 0.0065;
  return v;
}

// ---------- HUD ----------
export function setMsg(html: string): void { $('#msg').innerHTML = html; }

function bubble(seat: number, text: string, liar = false): void {
  if (seat === V.mySeat) return;
  const L = labels[seat];
  L.bubble.textContent = text; L.bubble.classList.toggle('liar', liar); L.bubble.classList.add('show');
  clearTimeout(L.timer); L.timer = window.setTimeout(() => L.bubble.classList.remove('show'), liar ? 2600 : 2000);
}
const gunTxt = (s: PublicSeat) => `🔫 1/${6 - s.shots}`;

function updateStats(): void {
  V.seats.forEach((s, i) => {
    const L = labels[i];
    if (i === V.mySeat) {
      L.el.style.display = 'none';
      $('#myName').textContent = s ? s.name : 'Ty';
      $('#myStats').textContent = !s ? '' : s.alive ? `${gunTxt(s)}  ·  kart: ${V.myHand.length}` : '✖ odpadłeś, oglądasz dalej';
      return;
    }
    if (!s) { L.el.style.display = 'none'; return; }
    L.name.textContent = s.name + (s.isBot ? ' 🤖' : '');
    L.stats.textContent = s.alive ? `🃏 ${s.count}  ·  ${gunTxt(s)}` : '✖ odpada';
    L.el.classList.toggle('dead', !s.alive);
    L.el.classList.toggle('active', i === V.active);
  });
  $('#bottom').classList.toggle('myturn', V.active === V.mySeat);
}

function updateFan(i: number): void {
  const c = charAt(i); if (!c) return;
  const f = c.fan;
  while (f.children.length) f.remove(f.children[0]);
  const s = V.seats[i];
  const n = s && s.alive ? s.count : 0;
  for (let k = 0; k < n; k++) {
    const a = k - (n - 1) / 2;
    const m = new THREE.Mesh(fanGeo, fanMat);
    m.position.set(a * 0.035, -Math.abs(a) * 0.008, k * 0.003); m.rotation.z = -a * 0.17; f.add(m);
  }
}

function applySt(st?: PublicState): void {
  if (!st) return;
  st.forEach((s, i) => { V.seats[i] = s; });
  V.seats.forEach((_, i) => updateFan(i));
  updateStats();
}

const HAND_ICONS: Partial<Record<Card, [string, string]>> = { J: ['★', 'JOKER'], D: ['😈', 'DIABEŁ'], M: ['🪞', 'LUSTRO'], X: ['×2', 'STRZAŁ'] };
function renderHand(animate: boolean): void {
  const h = $('#hand'); h.innerHTML = '';
  V.myHand.forEach((c, i) => {
    const d = document.createElement('div');
    d.className = 'card' + (sel.has(i) ? ' sel' : '') + (isTrue(c) ? ' match' : '');
    d.dataset.t = c;
    if (!animate) d.style.animation = 'none'; else d.style.animationDelay = `${i * 0.07}s`;
    const desc = SPECIAL_DESC[c]; if (desc) d.title = desc;
    const icon = HAND_ICONS[c];
    d.innerHTML = icon
      ? `<span class="big${c === 'J' || c === 'X' ? '' : ' emo'}">${icon[0]}</span><span class="small">${icon[1]}</span>`
      : `<span class="corner">${c}</span><span class="big">${c}</span>`;
    d.addEventListener('click', () => {
      initAudio();
      if (sel.has(i)) sel.delete(i); else if (sel.size < 3) sel.add(i);
      SFX.tick(); renderHand(false);
    });
    h.appendChild(d);
  });
  updateButtons();
}

function updateButtons(): void {
  const t = V.turn;
  const play = $<HTMLButtonElement>('#playBtn'), liar = $<HTMLButtonElement>('#liarBtn');
  play.disabled = !(t && !t.forced && sel.size >= 1 && sel.size <= 3);
  play.textContent = sel.size ? `Zagraj (${sel.size})` : 'Zagraj';
  liar.disabled = !(t && t.canChallenge);
}

/** Wyłącza przyciski (np. po wyrzuceniu z pokoju). */
export function endTurnUI(): void { V.turn = null; updateButtons(); }

function setTableCard(t: Rank): void {
  const tc = $('#tablecard'), mini = $('#miniCard');
  mini.textContent = t; mini.style.color = CARD_COL[t];
  $('#tableTxt').textContent = `Karta stołu: ${FULL[t]}`;
  $('#deckTxt').textContent = deckDesc(V.size, V.mode);
  tc.classList.add('show'); tc.classList.remove('pop'); void tc.offsetWidth; tc.classList.add('pop');
}

function flashScreen(color: string, peak: number, dur: number): void {
  const f = $('#flash');
  f.style.background = color; f.style.transition = 'none'; f.style.opacity = String(peak);
  requestAnimationFrame(() => requestAnimationFrame(() => { f.style.transition = `opacity ${dur}s`; f.style.opacity = '0'; }));
}

$('#playBtn').addEventListener('click', () => {
  const t = V.turn; if (!t || t.forced || sel.size < 1 || sel.size > 3) return;
  const idx = [...sel];
  V.myHand = V.myHand.filter((_, i) => !sel.has(i)); sel.clear();
  V.turn = null; renderHand(false);
  sendAction({ t: 'play', idx });
});
$('#liarBtn').addEventListener('click', () => {
  const t = V.turn; if (!t || !t.canChallenge) return;
  V.turn = null; updateButtons(); sendAction({ t: 'liar' });
});

// ---------- rozmiar stołu ----------
function setTableSize(n: TableSize): void {
  V.size = n;
  layoutState.n = n;
  layoutState.seatR = { 4: 1.85, 6: 2.15, 8: 2.5 }[n];
  const sc = { 4: 1, 6: 1.22, 8: 1.48 }[n];
  tableTop.scale.set(sc, 1, sc);
  GUN_REST_POS.set(0.7 * sc, tableY + 0.075, 0.32 * sc);
  spot.angle = { 4: 0.82, 6: 0.9, 8: 1.0 }[n];
  spot.position.y = bulb.position.y = n === 8 ? 2.7 : 2.5;
  layout();
}

function resetVisuals(): void {
  clearPile();
  for (const c of Object.values(models)) {
    c.upper.rotation.set(0, 0, 0); c.head.rotation.set(0, 0, 0); c.yaw = 0; c.pitch = 0;
    c.glow.forEach(m => { m.emissiveIntensity = m.userData.e; });
    c.lids.forEach(l => (l.userData.eye ? l.scale.set(1, 1, 1) : l.scale.set(1, 1, 0.01)));
    c.root.visible = false;
  }
  V.seats.forEach((_, i) => {
    const c = charAt(i); if (!c) return;
    c.root.visible = i !== V.mySeat;
    c.root.position.copy(seatPos(vIdx(i))); c.root.lookAt(0, 0, 0);
  });
  gun.g.position.copy(GUN_REST_POS); gun.g.quaternion.copy(GUN_REST_Q);
  $('#danger').classList.remove('on'); $('#flash').style.opacity = '0';
}

function killChar(i: number): void {
  const c = charAt(i); if (!c) return;
  c.glow.forEach(m => { m.emissiveIntensity = 0; });
  c.lids.forEach(l => (l.userData.eye ? l.scale.set(1, 0.15, 1) : l.scale.set(1, 1, 1)));
  const r0 = c.upper.rotation.x;
  void anim(0.7, k => { c.upper.rotation.x = r0 + 0.95 * k; c.upper.rotation.z = 0.12 * k; }, easeOutCubic);
  c.head.rotation.z = 0.5;
}

function seatOrigin(i: number): THREE.Vector3 {
  return i === V.mySeat ? HUMAN_CARD_ORIGIN.clone() : seatPos(vIdx(i)).multiplyScalar(0.72).setY(1.0);
}

function beginTable(mode: Mode, st: PublicState): void {
  V.mode = mode;
  setTableSize(st.length as TableSize);
  V.seats = st.slice(); V.turn = null; V.myHand = []; sel.clear();
  gazes.clear(); lastGaze = null;
  resetVisuals(); hideScreens(); renderHand(false); applySt(st);
}

// ---------- kolejka zdarzeń ----------
const queue: ViewEvent[] = [];
let processing = false;
export function handleEvent(ev: ViewEvent): void { queue.push(ev); if (!processing) void pump(); }
async function pump(): Promise<void> {
  processing = true;
  while (queue.length) {
    const ev = queue.shift()!;
    try { await applyEvent(ev); } catch (e) { console.error(e); }
  }
  processing = false;
}
/** Czeka, aż wszystkie animacje z kolejki się skończą (host używa tego do tempa gry). */
export function drained(): Promise<void> {
  return new Promise(r => { const chk = () => (!processing && !queue.length ? r() : setTimeout(chk, 60)); chk(); });
}

async function applyEvent(ev: ViewEvent): Promise<void> {
  switch (ev.t) {
    case 'begin':
      beginTable(ev.mode, ev.st);
      V.active = -1;
      setMsg('Siadamy do stołu…'); await sleep(600);
      break;

    case 'sync': {
      beginTable(ev.mode, ev.st);
      V.table = ev.table; V.active = ev.active;
      ev.st.forEach((q, i) => { if (q && !q.alive && i !== V.mySeat) killChar(i); });
      if (ev.round) setTableCard(ev.table);
      for (let k = 0; k < ev.pileN; k++) {
        const m = makeCard3D(); m.position.copy(pileSpot()); m.rotation.y = Math.random() * Math.PI * 2; pileGroup.add(m);
      }
      lastMeshes = ev.lastN > 0 ? (pileGroup.children.slice(-ev.lastN) as THREE.Mesh[]) : [];
      setMsg('Wróciłeś do gry.'); updateStats();
      break;
    }

    case 'round':
      clearPile(); V.table = ev.table; V.active = -1; applySt(ev.st);
      for (let i = 0; i < 4; i++) setTimeout(SFX.card, i * 90);
      setTableCard(ev.table);
      setMsg(`Runda ${ev.round}. Karta stołu: <b>${FULL[ev.table]}</b>`);
      await sleep(1500);
      break;

    case 'seat': V.mySeat = ev.seat; break;

    case 'hand':
      V.myHand = ev.cards; sel.clear(); renderHand(ev.deal); updateStats();
      break;

    case 'turn': {
      V.active = ev.seat;
      const mine = ev.seat === V.mySeat;
      V.turn = mine ? ev : null; V.deadline = mine ? Date.now() + ev.ms : 0;
      const s = V.seats[ev.seat];
      if (mine) {
        if (ev.forced) setMsg(`Nie masz już kart. <b>Musisz sprawdzić</b> zagranie: ${esc(seatName(ev.lastSeat))}.`);
        else if (ev.canChallenge) setMsg(`Twoja kolej. ${esc(seatName(ev.lastSeat))}: „${claimText(V.table, ev.lastN)}” Wierzysz?`);
        else setMsg(`Twoja kolej. Wybierz 1–3 karty i zagraj jako <b>${FULL[V.table].toLowerCase()}</b>.`);
        SFX.tick();
      } else setMsg(s?.isBot ? `${esc(s.name)} myśli…` : `Tura: <b>${esc(seatName(ev.seat))}</b>…`);
      updateButtons(); updateStats();
      break;
    }

    case 'play': {
      V.turn = null; updateButtons(); applySt(ev.st);
      const claim = claimText(V.table, ev.n);
      bubble(ev.seat, claim); setMsg(`${esc(seatName(ev.seat))}: „${claim}”`);
      const origin = seatOrigin(ev.seat);
      lastMeshes = [];
      const moves: Promise<void>[] = [];
      for (let k = 0; k < ev.n; k++) {
        const m = makeCard3D(); m.position.copy(origin);
        m.quaternion.setFromEuler(new THREE.Euler(-0.6, Math.atan2(origin.x, origin.z), 0));
        pileGroup.add(m); lastMeshes.push(m);
        const target = pileSpot();
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.random() * Math.PI * 2, 0));
        moves.push(sleep(k * 130).then(() => { SFX.card(); return moveObj(m, target, q, 0.5, 0.22); }));
      }
      await Promise.all(moves); await sleep(350);
      break;
    }

    case 'liar':
      V.turn = null; updateButtons(); SFX.liar();
      bubble(ev.seat, 'KŁAMCA!', true);
      setMsg(ev.seat === V.mySeat ? 'Krzyczysz <b>KŁAMCA!</b>' : `${esc(seatName(ev.seat))}: <b>„KŁAMCA!”</b>`);
      const lc = ev.seat !== V.mySeat ? charAt(ev.seat) : null;
      if (lc) {
        const r0 = lc.upper.rotation.x;
        void anim(0.15, k => { lc.upper.rotation.x = r0 + 0.25 * Math.sin(k * Math.PI); });
      }
      shake = 0.02; await sleep(900);
      break;

    case 'reveal': {
      SFX.flip();
      const n = lastMeshes.length;
      await Promise.all(lastMeshes.map((m, k) => {
        setFace(m, ev.cards[k]); m.castShadow = false;
        const target = new THREE.Vector3((k - (n - 1) / 2) * 0.34, PILE_Y + 0.03 + pileH, 0.42);
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI, 0, 0));
        return sleep(k * 120).then(() => moveObj(m, target, q, 0.6, 0.3));
      }));
      const shown = ev.cards.map(cardLabel).join(', ');
      const me = ev.target === V.mySeat, nm = esc(seatName(ev.target));
      let verdict = ev.truthful
        ? (me ? 'Prawda! Twoje karty były czyste.' : `Prawda! ${nm} nie kłamie.`)
        : (me ? 'Kłamstwo! Twój blef nie przeszedł.' : `Kłamstwo! ${nm} blefuje.`);
      if (ev.effect === 'devil') {
        verdict = me ? '😈 <b>Diabeł!</b> Strzelają wszyscy oprócz ciebie.' : `😈 <b>Diabeł!</b> Strzelają wszyscy oprócz: ${nm}.`;
        flashScreen('#a00000', 0.45, 1.2); shake = 0.05; SFX.liar();
      } else if (ev.effect === 'mirror') {
        verdict = ev.challenger === V.mySeat ? '🪞 <b>Lustro!</b> Kara odbija się na ciebie.' : `🪞 <b>Lustro!</b> Kara odbija się na: ${esc(seatName(ev.challenger))}.`;
        flashScreen('#cfe8ff', 0.4, 0.8);
      }
      if (ev.double) verdict += ' 💥 <b>Podwójny strzał!</b>';
      setMsg(`Odkryte: <b>${shown}</b> → ${verdict}`);
      await sleep(ev.effect || ev.double ? 2800 : 2000);
      break;
    }

    case 'shot': await rouletteAnim(ev); applySt(ev.st); break;

    case 'end':
      V.active = -1; V.turn = null; applySt(ev.st); updateButtons();
      setTimeout(() => onEnd(ev), 900);
      break;

    case 'info': setMsg(esc(ev.text)); applySt(ev.st); break;
  }
}

// ---------- rosyjska ruletka ----------
function sideOfHead(i: number): { head: THREE.Vector3; pos: THREE.Vector3 } {
  const c = charAt(i)!;
  const h = c.head.getWorldPosition(new THREE.Vector3()); h.y += 0.18;
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(c.root.quaternion);
  const a = h.clone().addScaledVector(right, 0.5), b = h.clone().addScaledVector(right, -0.5);
  return { head: h, pos: a.z > b.z ? a : b };
}

async function rouletteAnim(ev: Extract<GameEvent, { t: 'shot' }>): Promise<void> {
  const i = ev.seat, me = i === V.mySeat, s = V.seats[i];
  const again = ev.second ? ' Drugi raz!' : '';
  setMsg((me ? `Pociągasz za spust… <b>(szansa 1/${ev.den})</b>` : `${esc(seatName(i))} pociąga za spust… <b>(szansa 1/${ev.den})</b>`) + again);
  let pos: THREE.Vector3, look: THREE.Vector3;
  if (me) { pos = camera.localToWorld(new THREE.Vector3(0.26, -0.13, -0.5)); look = camera.position.clone().add(new THREE.Vector3(-0.05, 0.02, 0)); }
  else { const sd = sideOfHead(i); pos = sd.pos; look = sd.head; }
  const dummy = new THREE.Object3D(); dummy.position.copy(pos); dummy.lookAt(look);
  await moveObj(gun.g, pos, dummy.quaternion, 0.9, 0.35);
  if (me) $('#danger').classList.add('on');
  for (let k = 0; k < 9; k++) {
    SFX.tick();
    const r0 = gun.drum.rotation.z;
    void anim(0.06, x => { gun.drum.rotation.z = r0 + x * Math.PI / 3; });
    await sleep(55 + k * 14);
  }
  await sleep(300); SFX.beat(); await sleep(800); SFX.beat(); await sleep(850);
  if (ev.dead) {
    SFX.bang(); shake = me ? 0.12 : 0.07;
    gun.flashL.intensity = 8; gun.flashM.material.opacity = 1;
    void anim(0.35, k => { gun.flashL.intensity = 8 * (1 - k); gun.flashM.material.opacity = 1 - k; });
    if (me) { flashScreen('#a00000', 1, 2.5); setMsg('<b>BANG.</b> Odpadasz.'); }
    else { flashScreen('#fff', 0.55, 0.5); setMsg(`<b>BANG!</b> ${esc(seatName(i))} odpada.`); killChar(i); }
    const q0 = gun.g.quaternion.clone();
    const kick = gun.g.quaternion.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.5, 0, 0)));
    void anim(0.12, k => { gun.g.quaternion.copy(q0).slerp(kick, k); }).then(() => anim(0.3, k => { gun.g.quaternion.copy(kick).slerp(q0, k); }));
  } else {
    SFX.click();
    if (me) setMsg('<b>Klik.</b> Żyjesz. Na razie.');
    else {
      setMsg(`<b>Klik.</b> ${esc(seatName(i))} żyje.`);
      if (s?.isBot) { const r = RELIEF[s.kind]; bubble(i, r[Math.floor(Math.random() * r.length)]); }
    }
  }
  $('#danger').classList.remove('on');
  await sleep(ev.dead ? 1700 : 1300);
  await moveObj(gun.g, GUN_REST_POS, GUN_REST_Q, 0.8, 0.3);
}

// ---------- kamera ----------
const camBase = new THREE.Vector3(), camTarget = new THREE.Vector3();
let lookYaw = 0, lookPitch = 0;

/** Ustawienia kamery dobrane ręcznie do rozmiaru stołu i orientacji ekranu. */
const CAMERA: Record<TableSize, { portrait: [number[], number[], number]; landscape: [number[], number[], number] }> = {
  4: { portrait: [[0, 2.45, 4.0], [0, 0.62, -0.6], 64], landscape: [[0, 2.1, 3.3], [0, 0.78, -0.45], 76] },
  6: { portrait: [[0, 4.9, 4.4], [0, 0.2, -0.25], 66], landscape: [[0, 2.55, 3.95], [0, 0.75, -0.55], 84] },
  8: { portrait: [[0, 6.0, 4.6], [0, 0.35, -0.85], 72], landscape: [[0, 3.2, 4.6], [0, 0.6, -0.6], 90] },
};

export function layout(): void {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h;
  const [base, target, hfov] = CAMERA[V.size][w / h < 0.9 ? 'portrait' : 'landscape'];
  camBase.fromArray(base); camTarget.fromArray(target);
  shade.visible = bulb.visible = camBase.y < 3.5;
  const vfov = 2 * Math.atan(Math.tan(hfov * Math.PI / 360) / camera.aspect) * 180 / Math.PI;
  camera.fov = Math.min(Math.max(vfov, 46), 90); camera.updateProjectionMatrix();
}

let drag: { x: number; y: number; yaw: number; pitch: number } | null = null;
canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, yaw: lookYaw, pitch: lookPitch }; });
window.addEventListener('pointermove', e => {
  if (!drag) return;
  lookYaw = Math.max(-0.7, Math.min(0.7, drag.yaw - (e.clientX - drag.x) * 0.004));
  lookPitch = Math.max(-0.3, Math.min(0.35, drag.pitch + (e.clientY - drag.y) * 0.003));
});
window.addEventListener('pointerup', () => { drag = null; });
window.addEventListener('pointercancel', () => { drag = null; });
window.addEventListener('resize', layout);

// ---------- pętla renderowania ----------
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), camFwd = new THREE.Vector3(), toHead = new THREE.Vector3();
/** Postać, na którą patrzysz (w stożku ~8° od środka ekranu), odwzajemnia spojrzenie. */
const EYE_CONTACT_COS = Math.cos(8 * Math.PI / 180);

// ---------- moje spojrzenie dla innych ----------
let lastGaze: Gaze | null = null, lastGazeAt = 0, nextGazeCheck = 0;
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Na kogo albo na co patrzę: postać na środku ekranu, a jeśli żadna – punkt na stole przed kamerą. */
function myGaze(): Gaze {
  let best = -1, bestDot = EYE_CONTACT_COS;
  V.seats.forEach((s, i) => {
    const c = charAt(i);
    if (!s || i === V.mySeat || !c?.root.visible) return;
    const d = c.head.getWorldPosition(toHead).sub(camera.position).normalize().dot(camFwd);
    if (d > bestDot) { bestDot = d; best = i; }
  });
  if (best >= 0) return { at: best };
  const t = camFwd.y < -0.05 ? Math.min(6, (tableY - camera.position.y) / camFwd.y) : 5;
  const p = camera.position.clone().addScaledVector(camFwd, t);
  const [x, y, z] = toCanonical([p.x, p.y, p.z], V.mySeat, V.size);
  return { p: [r2(x), r2(y), r2(z)] };
}

/** Wysyła spojrzenie najwyżej ~7 razy na sekundę i tylko gdy się zmieniło (albo co 2 s). */
function shareGaze(now: number): void {
  if (now < nextGazeCheck || !V.seats.length || !V.seats[V.mySeat]?.alive) return;
  nextGazeCheck = now + 150;
  const g = myGaze();
  if (gazeChanged(lastGaze, g) || now - lastGazeAt > 2000) { lastGaze = g; lastGazeAt = now; sendLook(g); }
}

/** Punkt, na który patrzy inny człowiek (w moim widoku), albo null, gdy nic nie wiadomo. */
function humanGazeTarget(i: number, now: number, out: THREE.Vector3): boolean {
  const e = gazes.get(i);
  if (!e || now - e.t > GAZE_FRESH_MS) return false;
  if ('at' in e.g) {
    if (e.g.at === V.mySeat) { out.copy(camera.position); return true; }
    const tc = charAt(e.g.at);
    if (!tc) return false;
    tc.head.getWorldPosition(out); return true;
  }
  const [x, y, z] = fromCanonical(e.g.p, V.mySeat, V.size);
  out.set(x, y, z); return true;
}
const clock = new THREE.Clock();
const timerEl = $('#timer');

function frame(now: number): void {
  requestAnimationFrame(frame);
  const t = clock.getElapsedTime();
  stepTweens(now);

  // lampa migocze, kurz unosi się w świetle
  const fl = 1 + Math.sin(t * 13) * 0.015 + Math.sin(t * 31) * 0.01 + (Math.sin(t * 0.7) > 0.985 ? -0.25 : 0);
  spot.intensity = 2.6 * fl;
  (bulb.material as THREE.MeshBasicMaterial).color.setScalar(0.85 + 0.15 * fl);
  const pa = dustGeo.attributes.position.array as Float32Array;
  for (let i = 0; i < dustN; i++) {
    pa[i * 3 + 1] += Math.sin(t * 0.5 + i) * 0.0004 + 0.0002;
    if (pa[i * 3 + 1] > 2.5) pa[i * 3 + 1] = 0.9;
    pa[i * 3] += Math.sin(t * 0.3 + i * 1.7) * 0.0003;
  }
  dustGeo.attributes.position.needsUpdate = true;

  // kamera: lekkie bujanie, wstrząsy, rozglądanie
  if (!drag) { lookYaw *= 0.995; lookPitch *= 0.995; }
  camera.position.set(camBase.x + Math.sin(t * 0.4) * 0.02, camBase.y + Math.sin(t * 0.55) * 0.015, camBase.z);
  if (shake > 0.0005) { camera.position.x += (Math.random() - 0.5) * shake; camera.position.y += (Math.random() - 0.5) * shake; shake *= 0.9; }
  const dist = camBase.distanceTo(camTarget);
  tmp.copy(camTarget); tmp.x += Math.sin(lookYaw) * dist; tmp.z += (1 - Math.cos(lookYaw)) * dist; tmp.y += lookPitch * dist;
  camera.lookAt(tmp);

  if (V.turn && V.deadline) {
    const left = Math.max(0, Math.ceil((V.deadline - Date.now()) / 1000));
    timerEl.textContent = `⏱ ${left}s`; timerEl.classList.toggle('low', left <= 10);
  } else timerEl.textContent = '';

  // postacie: oddech, wzrok, podpisy nad głowami
  camera.getWorldDirection(camFwd);
  shareGaze(now);
  labels.forEach((L, i) => {
    const s = V.seats[i], c = charAt(i);
    if (!s || !c || !c.root.visible) { L.el.style.display = 'none'; return; }
    if (s.alive) {
      c.upper.position.y = 0.55 + Math.sin(t * 1.6 + i * 2) * 0.006;
      // Człowiek: głowa idzie tam, gdzie on naprawdę patrzy (dane z sieci).
      // Bot: rewolwer w ruchu > ty (gdy na niego patrzysz) > aktywny gracz > ty.
      c.head.getWorldPosition(toHead).sub(camera.position).normalize();
      const human = !s.isBot && i !== V.mySeat && humanGazeTarget(i, now, tmp2);
      const eyeContact = !human && toHead.dot(camFwd) > EYE_CONTACT_COS;
      if (human) { /* cel już w tmp2 */ }
      else if (gun.g.position.distanceTo(GUN_REST_POS) > 0.05) tmp2.copy(gun.g.position);
      else if (eyeContact) tmp2.copy(camera.position);
      else if (V.active >= 0 && V.active !== i) {
        const ac = charAt(V.active);
        if (V.active === V.mySeat || !ac) tmp2.copy(camera.position); else ac.head.getWorldPosition(tmp2);
      } else if (V.active === i) tmp2.set(0, PILE_Y - 0.2, 0);
      else tmp2.copy(camera.position);
      const local = c.root.worldToLocal(tmp2.clone()).sub(new THREE.Vector3(0, 1.45, 0));
      const ty = Math.max(-1.2, Math.min(1.2, Math.atan2(local.x, local.z)));
      const tp = Math.max(-0.5, Math.min(0.5, -Math.atan2(local.y, Math.hypot(local.x, local.z))));
      const speed = human ? 0.15 : eyeContact ? 0.1 : 0.06;
      c.yaw += (ty - c.yaw) * speed; c.pitch += (tp - c.pitch) * speed;
      c.head.rotation.y = c.yaw; c.head.rotation.x = c.pitch;
      c.fan.rotation.z = Math.sin(t * 1.3 + i) * 0.03;
    }
    c.head.getWorldPosition(tmp2); tmp2.y += 0.56;
    tmp2.project(camera);
    const x = (tmp2.x * 0.5 + 0.5) * window.innerWidth, y = (-tmp2.y * 0.5 + 0.5) * window.innerHeight;
    L.el.style.left = `${Math.max(60, Math.min(window.innerWidth - 60, x))}px`;
    L.el.style.top = `${Math.max(70, y)}px`;
    L.el.style.display = tmp2.z < 1 ? '' : 'none';
  });

  renderer.render(scene, camera);
}

export function startRendering(): void {
  layout();
  requestAnimationFrame(frame);
}
