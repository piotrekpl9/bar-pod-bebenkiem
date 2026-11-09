// ---------- tweeny ----------
const tweens = [];
const ease = k => k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
function anim(dur, fn, e = ease) {
  if (document.hidden) { fn(e(1)); return Promise.resolve(); }
  return new Promise(res => tweens.push({ t0: performance.now(), dur: dur * 1000, fn, e, res }));
}
function finishTweens() { while (tweens.length) { const tw = tweens.pop(); tw.fn(tw.e(1)); tw.res(); } }
document.addEventListener('visibilitychange', () => { if (document.hidden) finishTweens(); });
function moveObj(o, toPos, toQ, dur, arc = 0) {
  const p0 = o.position.clone(), q0 = o.quaternion.clone();
  return anim(dur, k => { o.position.lerpVectors(p0, toPos, k); o.position.y += Math.sin(k * Math.PI) * arc; if (toQ) o.quaternion.copy(q0).slerp(toQ, k); });
}
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- miejsca i postacie ----------
const KINDS = ['frog', 'robot', 'owl', 'mustache', 'bear', 'cat', 'rabbit', 'penguin'];
const BOT_NAMES = { frog: 'Żaneta', robot: 'Zbychu', owl: 'Halina', mustache: 'Rysiek', bear: 'Bogdan', cat: 'Kasia', rabbit: 'Zenek', penguin: 'Gienia' };
const TRAITS = { rabbit: { bluff: 0.33, susp: 0.9 }, penguin: { bluff: 0.18, susp: 1.2 }, bear: { bluff: 0.2, susp: 0.95 }, cat: { bluff: 0.35, susp: 1.15 }, frog: { bluff: 0.3, susp: 1.1 }, robot: { bluff: 0.25, susp: 1.0 }, owl: { bluff: 0.14, susp: 1.25 }, mustache: { bluff: 0.42, susp: 0.85 } };
const RELIEF = {
  frog: ['Kum kum… żyję!', 'Rechot ulgi.', 'Nie tym razem.'],
  robot: ['Bzzz… żyję.', 'Błąd 404: kula.', 'Obwody całe.'],
  owl: ['Huhu… pusto.', 'Nie dziś, kochani.', 'Uff!'],
  mustache: ['Ha! Szczęściarz!', 'Jeszcze nie teraz.', 'Wąs ocalał.'],
  bear: ['Mrrr… żyję.', 'Gruba skóra.', 'Phi!'],
  cat: ['Mam jeszcze osiem żyć.', 'Miau… pusto.', 'Fart.'],
  rabbit: ['Uszy w górę, żyję!', 'Kicam dalej.', 'Uff, marchewka czeka.'],
  penguin: ['Zimna krew.', 'Elegancko, pusto.', 'Nie tym razem, kochani.'],
};
const chars = KINDS.map(k => { const c = makeCharacter(k); c.root.visible = false; scene.add(c.root); return c; });
const labels = KINDS.map(() => {
  const el = document.createElement('div'); el.className = 'label'; el.style.display = 'none';
  el.innerHTML = '<div class="bubble"></div><div class="name"></div><div class="stats"></div>';
  $('#labels').appendChild(el);
  return { el, bubble: el.querySelector('.bubble'), name: el.querySelector('.name'), stats: el.querySelector('.stats') };
});
const HUMAN_CARD_ORIGIN = new V3(0, 1.05, 1.55);

// ---------- stan widoku (każdy gracz) ----------
const V = { mySeat: 0, seats: [null, null, null, null], table: 'K', active: -1, turn: null, started: false, myHand: [], deadline: 0 };
const vIdx = s => (s - V.mySeat + TABLE_N) % TABLE_N;
// rozmiar stołu: 4 albo 6 miejsc
const SPECIAL_DESC = {
  D: 'Diabeł: liczy się jak prawdziwa karta. Odkryty = strzelają wszyscy oprócz tego, kto go zagrał.',
  M: 'Lustro: liczy się jak prawdziwa karta. Odkryte = kara odbija się na oskarżyciela.',
  X: 'Podwójny strzał: zawsze jest kłamstwem. Odkryty = przegrany strzela dwa razy.',
  J: 'Joker: pasuje do każdej karty stołu.',
};
function deckDesc(n, mode) {
  const D = DECKS[n] || DECKS[4], sp = mode === 'special';
  return `Talia (${3 * D.per + D.jokers + (sp ? 3 : 0)}): ${D.per}×K · ${D.per}×Q · ${D.per}×A · ${D.jokers}×Joker` + (sp ? ' · Diabeł · Lustro · ×2' : '');
}
const DECKS = { 4: { per: 6, jokers: 2 }, 6: { per: 9, jokers: 3 }, 8: { per: 12, jokers: 4 } };
function setTableSize(n) {
  TABLE_N = n === 8 ? 8 : n === 6 ? 6 : 4;
  SEAT_R = { 4: 1.85, 6: 2.15, 8: 2.5 }[TABLE_N];
  const sc = { 4: 1, 6: 1.22, 8: 1.48 }[TABLE_N];
  tableTop.scale.set(sc, 1, sc);
  GUN_REST_POS.set(0.7 * sc, tableY + 0.075, 0.32 * sc);
  spot.angle = { 4: 0.82, 6: 0.9, 8: 1.0 }[TABLE_N]; spot.position.y = bulb.position.y = TABLE_N === 8 ? 2.7 : 2.5;
  chars.forEach((c, i) => { if (i >= TABLE_N) c.root.visible = false; });
  layout();
}
const seatName = s => s === V.mySeat ? 'Ty' : (V.seats[s] ? V.seats[s].name : '?');
const isTrue = c => c === V.table || c === 'J' || c === 'D' || c === 'M';
let sel = new Set(), lastMeshes = [], pileH = 0;
const pileGroup = new THREE.Group(); scene.add(pileGroup);
const faceMats = {}; ['K', 'Q', 'A', 'J', 'D', 'M', 'X'].forEach(t => faceMats[t] = new THREE.MeshStandardMaterial({ map: faceTex(t), roughness: 0.6 }));
const backMat = new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.6 });
const edgeMat = mat(0xd8ccb0);
const cardGeo = new THREE.BoxGeometry(0.3, 0.006, 0.42);
// zakryta karta ma rewers z OBU stron – twarz pojawia się dopiero przy odkryciu (reveal)
const makeCard3D = () => { const m = new THREE.Mesh(cardGeo, [edgeMat, edgeMat, backMat, backMat, edgeMat, edgeMat]); m.castShadow = true; m.receiveShadow = true; return m; };

function setMsg(h) { $('#msg').innerHTML = h; }
function bubble(seat, text, liar = false) {
  if (seat === V.mySeat) return;
  const L = labels[seat], b = L.bubble; b.textContent = text; b.classList.toggle('liar', liar); b.classList.add('show');
  clearTimeout(L.bt); L.bt = setTimeout(() => b.classList.remove('show'), liar ? 2600 : 2000);
}
const gunTxt = s => `🔫 1/${6 - s.shots}`;
function updateStats() {
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
function updateFan(i) {
  const f = chars[i].fan; while (f.children.length) f.remove(f.children[0]);
  const s = V.seats[i]; const n = s && s.alive ? s.count : 0;
  for (let k = 0; k < n; k++) {
    const a = k - (n - 1) / 2; const m = new THREE.Mesh(fanGeo, fanMat);
    m.position.set(a * 0.035, -Math.abs(a) * 0.008, k * 0.003); m.rotation.z = -a * 0.17; f.add(m);
  }
}
function applySt(st) {
  if (!st) return;
  st.forEach((s, i) => { V.seats[i] = s; });
  V.seats.forEach((_, i) => updateFan(i));
  updateStats();
}
function renderHand(animate) {
  const h = $('#hand'); h.innerHTML = '';
  V.myHand.forEach((c, i) => {
    const d = document.createElement('div');
    d.className = 'card' + (sel.has(i) ? ' sel' : '') + (isTrue(c) ? ' match' : '');
    d.dataset.t = c;
    if (!animate) d.style.animation = 'none'; else d.style.animationDelay = (i * 0.07) + 's';
    if (SPECIAL_DESC[c]) d.title = SPECIAL_DESC[c];
    const SP = { J: ['★', 'JOKER'], D: ['😈', 'DIABEŁ'], M: ['🪞', 'LUSTRO'], X: ['×2', 'STRZAŁ'] }[c];
    d.innerHTML = SP ? `<span class="big${c === 'J' || c === 'X' ? '' : ' emo'}">${SP[0]}</span><span class="small">${SP[1]}</span>` : `<span class="corner">${c}</span><span class="big">${c}</span>`;
    d.addEventListener('click', () => { initAudio(); if (sel.has(i)) sel.delete(i); else if (sel.size < 3) sel.add(i); SFX.tick(); renderHand(false); });
    h.appendChild(d);
  });
  updateButtons();
}
function updateButtons() {
  const t = V.turn;
  $('#playBtn').disabled = !(t && !t.forced && sel.size >= 1 && sel.size <= 3);
  $('#playBtn').textContent = sel.size ? `Zagraj (${sel.size})` : 'Zagraj';
  $('#liarBtn').disabled = !(t && t.canChallenge);
}
function setTableCard(t) {
  const tc = $('#tablecard'); $('#miniCard').textContent = t; $('#miniCard').style.color = CARD_COL[t];
  $('#tableTxt').textContent = `Karta stołu: ${FULL[t]}`;
  $('#deckTxt').textContent = deckDesc(TABLE_N, V.mode);
  tc.classList.add('show'); tc.classList.remove('pop'); void tc.offsetWidth; tc.classList.add('pop');
}
function flashScreen(color, peak, dur) {
  const f = $('#flash'); f.style.background = color; f.style.transition = 'none'; f.style.opacity = peak;
  requestAnimationFrame(() => requestAnimationFrame(() => { f.style.transition = `opacity ${dur}s`; f.style.opacity = 0; }));
}
function resetVisuals() {
  while (pileGroup.children.length) pileGroup.remove(pileGroup.children[0]);
  pileH = 0; lastMeshes = [];
  chars.forEach((c, i) => {
    c.upper.rotation.set(0, 0, 0); c.head.rotation.set(0, 0, 0); c.yaw = 0; c.pitch = 0;
    c.glow.forEach(m => m.emissiveIntensity = m.userData.e);
    c.lids.forEach(l => l.userData.eye ? l.scale.set(1, 1, 1) : l.scale.set(1, 1, 0.01));
    const s = i < TABLE_N ? V.seats[i] : null;
    c.root.visible = !!s && i !== V.mySeat;
    c.root.position.copy(seatPos(vIdx(i))); c.root.lookAt(0, 0, 0);
  });
  gun.g.position.copy(GUN_REST_POS); gun.g.quaternion.copy(GUN_REST_Q);
  $('#danger').classList.remove('on'); $('#flash').style.opacity = 0;
}
function killChar(i) {
  const c = chars[i];
  c.glow.forEach(m => m.emissiveIntensity = 0);
  c.lids.forEach(l => l.userData.eye ? l.scale.set(1, 0.15, 1) : l.scale.set(1, 1, 1));
  const r0 = c.upper.rotation.x;
  anim(0.7, k => { c.upper.rotation.x = r0 + 0.95 * k; c.upper.rotation.z = 0.12 * k; }, k => 1 - Math.pow(1 - k, 3));
  c.head.rotation.z = 0.5;
}
function seatOrigin(i) { return i === V.mySeat ? HUMAN_CARD_ORIGIN.clone() : seatPos(vIdx(i)).multiplyScalar(0.72).setY(1.0); }

// ---------- kolejka zdarzeń (animacje u każdego gracza) ----------
const evQueue = []; let processing = false;
function handleEvent(ev) { evQueue.push(ev); if (!processing) pump(); }
async function pump() {
  processing = true;
  while (evQueue.length) { const ev = evQueue.shift(); try { await applyEvent(ev); } catch (e) { console.error(e); } }
  processing = false;
}
function drained() { return new Promise(r => { const chk = () => (!processing && !evQueue.length) ? r() : setTimeout(chk, 60); chk(); }); }

async function applyEvent(ev) {
  switch (ev.t) {
    case 'begin': {
      V.mode = ev.mode || 'classic'; setTableSize(ev.st.length); V.seats = ev.st.slice(); V.started = true; V.active = -1; V.turn = null; V.myHand = []; sel.clear();
      resetVisuals(); hideScreens(); renderHand(false); applySt(ev.st);
      setMsg('Siadamy do stołu…'); await sleep(600); break;
    }
    case 'sync': {
      V.mode = ev.mode || 'classic'; setTableSize(ev.st.length); V.seats = ev.st.slice(); V.started = true; V.table = ev.table; V.active = ev.active; V.turn = null; V.myHand = []; sel.clear();
      resetVisuals(); hideScreens(); renderHand(false); applySt(ev.st);
      ev.st.forEach((q, i) => { if (q && !q.alive && i !== V.mySeat) killChar(i); });
      if (ev.round) setTableCard(ev.table);
      for (let k = 0; k < ev.pileN; k++) {
        const m = makeCard3D(); m.position.set((rnd() - 0.5) * 0.28, PILE_Y + 0.004 + pileH, (rnd() - 0.5) * 0.28 - 0.05); pileH += 0.0065;
        m.rotation.y = rnd() * Math.PI * 2; pileGroup.add(m);
      }
      lastMeshes = ev.lastN > 0 ? pileGroup.children.slice(-ev.lastN) : [];
      setMsg('Wróciłeś do gry.'); updateStats(); break;
    }
    case 'round': {
      while (pileGroup.children.length) pileGroup.remove(pileGroup.children[0]);
      pileH = 0; lastMeshes = []; V.table = ev.table; V.active = -1; applySt(ev.st);
      for (let i = 0; i < 4; i++) setTimeout(SFX.card, i * 90);
      setTableCard(ev.table);
      setMsg(`Runda ${ev.round}. Karta stołu: <b>${FULL[ev.table]}</b>`);
      await sleep(1500); break;
    }
    case 'hand': V.myHand = ev.cards; sel.clear(); renderHand(ev.deal); updateStats(); break;
    case 'turn': {
      V.active = ev.seat; const mine = ev.seat === V.mySeat;
      V.turn = mine ? ev : null; V.deadline = mine ? Date.now() + ev.ms : 0;
      const s = V.seats[ev.seat];
      if (mine) {
        if (ev.forced) setMsg(`Nie masz już kart. <b>Musisz sprawdzić</b> zagranie: ${esc(seatName(ev.lastSeat))}.`);
        else if (ev.canChallenge) setMsg(`Twoja kolej. ${esc(seatName(ev.lastSeat))}: „${claimText(V.table, ev.lastN)}” Wierzysz?`);
        else setMsg(`Twoja kolej. Wybierz 1–3 karty i zagraj jako <b>${FULL[V.table].toLowerCase()}</b>.`);
        SFX.tick();
      } else setMsg(s && s.isBot ? `${esc(s.name)} myśli…` : `Tura: <b>${esc(seatName(ev.seat))}</b>…`);
      updateButtons(); updateStats(); break;
    }
    case 'play': {
      V.turn = null; updateButtons(); applySt(ev.st);
      const claim = claimText(V.table, ev.n);
      bubble(ev.seat, claim); setMsg(`${esc(seatName(ev.seat))}: „${claim}”`);
      const origin = seatOrigin(ev.seat); lastMeshes = [];
      const moves = [];
      for (let k = 0; k < ev.n; k++) {
        const m = makeCard3D(); m.position.copy(origin);
        m.quaternion.setFromEuler(new THREE.Euler(-0.6, Math.atan2(origin.x, origin.z), 0));
        pileGroup.add(m); lastMeshes.push(m);
        const target = new V3((rnd() - 0.5) * 0.28, PILE_Y + 0.004 + pileH, (rnd() - 0.5) * 0.28 - 0.05); pileH += 0.0065;
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rnd() * Math.PI * 2, 0));
        moves.push(sleep(k * 130).then(() => { SFX.card(); return moveObj(m, target, q, 0.5, 0.22); }));
      }
      await Promise.all(moves); await sleep(350); break;
    }
    case 'liar': {
      V.turn = null; updateButtons(); SFX.liar();
      bubble(ev.seat, 'KŁAMCA!', true);
      setMsg(ev.seat === V.mySeat ? 'Krzyczysz <b>KŁAMCA!</b>' : `${esc(seatName(ev.seat))}: <b>„KŁAMCA!”</b>`);
      if (ev.seat !== V.mySeat) { const c = chars[ev.seat]; const r0 = c.upper.rotation.x; anim(0.15, k => c.upper.rotation.x = r0 + 0.25 * Math.sin(k * Math.PI)); }
      shake = 0.02; await sleep(900); break;
    }
    case 'reveal': {
      SFX.flip(); const n = lastMeshes.length;
      await Promise.all(lastMeshes.map((m, k) => {
        m.material[3] = faceMats[ev.cards[k]] || faceMats.K; m.castShadow = false;
        const target = new V3((k - (n - 1) / 2) * 0.34, PILE_Y + 0.03 + pileH, 0.42);
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI, 0, 0));
        return sleep(k * 120).then(() => moveObj(m, target, q, 0.6, 0.3));
      }));
      const shown = ev.cards.map(cardLabel).join(', ');
      const me = ev.target === V.mySeat, nm = esc(seatName(ev.target));
      let verdict = ev.truthful ? (me ? 'Prawda! Twoje karty były czyste.' : `Prawda! ${nm} nie kłamie.`) : (me ? 'Kłamstwo! Twój blef nie przeszedł.' : `Kłamstwo! ${nm} blefuje.`);
      if (ev.effect === 'devil') {
        verdict = me ? '😈 <b>Diabeł!</b> Strzelają wszyscy oprócz ciebie.' : `😈 <b>Diabeł!</b> Strzelają wszyscy oprócz: ${nm}.`;
        flashScreen('#a00000', 0.45, 1.2); shake = 0.05; SFX.liar();
      } else if (ev.effect === 'mirror') {
        verdict = ev.challenger === V.mySeat ? '🪞 <b>Lustro!</b> Kara odbija się na ciebie.' : `🪞 <b>Lustro!</b> Kara odbija się na: ${esc(seatName(ev.challenger))}.`;
        flashScreen('#cfe8ff', 0.4, 0.8);
      }
      if (ev.double) verdict += ' 💥 <b>Podwójny strzał!</b>';
      setMsg(`Odkryte: <b>${shown}</b> → ${verdict}`);
      await sleep(ev.effect || ev.double ? 2800 : 2000); break;
    }
    case 'shot': await rouletteAnim(ev); applySt(ev.st); break;
    case 'end': V.active = -1; V.turn = null; applySt(ev.st); updateButtons(); showEnd(ev); break;
    case 'info': setMsg(esc(ev.text)); applySt(ev.st); break;
  }
}

function sideOfHead(i) {
  const c = chars[i]; const h = c.head.getWorldPosition(new V3()); h.y += 0.18;
  const right = new V3(1, 0, 0).applyQuaternion(c.root.quaternion);
  const a = h.clone().addScaledVector(right, 0.5), b = h.clone().addScaledVector(right, -0.5);
  return { head: h, pos: (a.z > b.z ? a : b) };
}
async function rouletteAnim(ev) {
  const i = ev.seat, me = i === V.mySeat, s = V.seats[i];
  const again = ev.second ? ' Drugi raz!' : '';
  setMsg((me ? `Pociągasz za spust… <b>(szansa 1/${ev.den})</b>` : `${esc(seatName(i))} pociąga za spust… <b>(szansa 1/${ev.den})</b>`) + again);
  let pos, look;
  if (me) { pos = camera.localToWorld(new V3(0.26, -0.13, -0.5)); look = camera.position.clone().add(new V3(-0.05, 0.02, 0)); }
  else { const sd = sideOfHead(i); pos = sd.pos; look = sd.head; }
  const dummy = new THREE.Object3D(); dummy.position.copy(pos); dummy.lookAt(look);
  await moveObj(gun.g, pos, dummy.quaternion, 0.9, 0.35);
  if (me) $('#danger').classList.add('on');
  for (let k = 0; k < 9; k++) { SFX.tick(); const r0 = gun.drum.rotation.z; anim(0.06, x => gun.drum.rotation.z = r0 + x * Math.PI / 3); await sleep(55 + k * 14); }
  await sleep(300); SFX.beat(); await sleep(800); SFX.beat(); await sleep(850);
  if (ev.dead) {
    SFX.bang(); shake = me ? 0.12 : 0.07;
    gun.flashL.intensity = 8; gun.flashM.material.opacity = 1;
    anim(0.35, k => { gun.flashL.intensity = 8 * (1 - k); gun.flashM.material.opacity = 1 - k; });
    if (me) { flashScreen('#a00000', 1, 2.5); setMsg('<b>BANG.</b> Odpadasz.'); }
    else { flashScreen('#fff', 0.55, 0.5); setMsg(`<b>BANG!</b> ${esc(seatName(i))} odpada.`); killChar(i); }
    const q0 = gun.g.quaternion.clone(), kick = gun.g.quaternion.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.5, 0, 0)));
    anim(0.12, k => gun.g.quaternion.copy(q0).slerp(kick, k)).then(() => anim(0.3, k => gun.g.quaternion.copy(kick).slerp(q0, k)));
  } else {
    SFX.click();
    if (me) setMsg('<b>Klik.</b> Żyjesz. Na razie.');
    else { setMsg(`<b>Klik.</b> ${esc(seatName(i))} żyje.`); if (s && s.isBot) { const r = RELIEF[s.kind]; bubble(i, r[(rnd() * r.length) | 0]); } }
  }
  $('#danger').classList.remove('on');
  await sleep(ev.dead ? 1700 : 1300);
  await moveObj(gun.g, GUN_REST_POS, GUN_REST_Q, 0.8, 0.3);
}

// ---------- akcje gracza ----------
function sendAction(a) {
  if (NET.isHost) hostOnAction(V.mySeat, a);
  else if (NET.conn && NET.conn.open) NET.conn.send({ t: 'act', a });
}
$('#playBtn').addEventListener('click', () => {
  const t = V.turn; if (!t || t.forced || sel.size < 1 || sel.size > 3) return;
  const idx = [...sel];
  V.myHand = V.myHand.filter((_, i) => !sel.has(i)); sel.clear();
  V.turn = null; renderHand(false);
  sendAction({ t: 'play', idx });
});
$('#liarBtn').addEventListener('click', () => { const t = V.turn; if (!t || !t.canChallenge) return; V.turn = null; updateButtons(); sendAction({ t: 'liar' }); });

// ================= LOGIKA HOSTA (decyduje o wszystkim) =================
const turnMs = () => ({ 4: 60000, 6: 45000, 8: 40000 })[H.N] || 60000;
const H = { N: 4, mode: 'classic', seats: [null, null, null, null], table: 'K', plays: [], lastPlay: null, round: 0, running: false, pending: null, token: 0 };
const hTrue = c => c === H.table || c === 'J' || c === 'D' || c === 'M';
function pub() { return H.seats.map(s => s ? { name: s.name, kind: s.kind, isBot: s.isBot, alive: s.alive, shots: s.shots, count: s.hand.length } : null); }
function safeSend(conn, ev) { try { if (conn && conn.open) conn.send(ev); } catch (e) { console.warn(e); } }
function emit(ev) { handleEvent(ev); H.seats.forEach(s => { if (s && s.conn) safeSend(s.conn, ev); }); }
function sendHand(i, deal) {
  const s = H.seats[i]; if (!s || s.isBot) return;
  const ev = { t: 'hand', cards: s.hand.slice(), deal: !!deal };
  if (s.local) handleEvent(ev); else safeSend(s.conn, ev);
}
function botChoosePlay(i) {
  const s = H.seats[i], hand = s.hand, tIdx = [], fIdx = [], tr = TRAITS[s.kind];
  hand.forEach((c, k) => (hTrue(c) ? tIdx : fIdx).push(k));
  const lie = tIdx.length === 0 || (fIdx.length > 0 && rnd() < tr.bluff);
  if (!lie) {
    tIdx.sort((a, b) => (hand[a] === 'J') - (hand[b] === 'J'));
    let n = rnd() < 0.5 ? 1 : rnd() < 0.75 ? 2 : 3;
    if (fIdx.length === 0) n = 3;
    return tIdx.slice(0, Math.min(n, tIdx.length));
  }
  const n = Math.min(fIdx.length, rnd() < 0.65 ? 1 : 2);
  const pick = shuffle(fIdx.slice()).slice(0, n);
  if (tIdx.length && pick.length < 3 && rnd() < 0.3) pick.push(tIdx[0]);
  return pick;
}
function botShouldChallenge(i) {
  const s = H.seats[i], lp = H.lastPlay, n = lp.cards.length, tr = TRAITS[s.kind];
  const ownT = s.hand.filter(hTrue).length + H.plays.filter(p => p.seat === i).reduce((a, p) => a + p.cards.filter(hTrue).length, 0);
  const claims = H.plays.filter(p => p.seat !== i).reduce((a, p) => a + p.cards.length, 0);
  const total = DECKS[H.N].per + DECKS[H.N].jokers + (H.mode === 'special' ? 2 : 0);
  if (ownT + claims > total) return true;
  let pr = 0.07 + 0.12 * (n - 1) + 0.5 * Math.pow((ownT + claims) / total, 2);
  if (H.seats[lp.seat].hand.length === 0) pr += 0.12;
  if (s.hand.filter(hTrue).length === 0) pr += 0.2;
  pr -= 0.15 / (6 - s.shots);
  pr *= tr.susp;
  return rnd() < Math.max(0.03, Math.min(0.92, pr));
}
function botDecide(i, canChallenge, forced) {
  if (canChallenge && (forced || botShouldChallenge(i))) return { type: 'liar' };
  return { type: 'play', cards: botChoosePlay(i) };
}
function resolvePending(a) { const p = H.pending; if (!p) return; clearTimeout(p.timer); H.pending = null; p.res(a); }
async function waitAction(i, canChallenge, forced) {
  H.active = i;
  emit({ t: 'turn', seat: i, canChallenge, forced, ms: turnMs(), lastSeat: H.lastPlay ? H.lastPlay.seat : -1, lastN: H.lastPlay ? H.lastPlay.cards.length : 0 });
  const s = H.seats[i];
  if (s.isBot) { await sleep(900 + rnd() * 1300); return botDecide(i, canChallenge, forced); }
  return new Promise(res => {
    H.pending = { seat: i, canChallenge, forced, res, deadline: Date.now() + turnMs(), timer: setTimeout(() => resolvePending(forced ? { type: 'liar' } : { type: 'play', cards: [0] }), turnMs() + 1500) };
  });
}
function hostOnAction(i, a) {
  const p = H.pending; if (!p || p.seat !== i || !a) return;
  if (a.t === 'liar') { if (p.canChallenge) resolvePending({ type: 'liar' }); return; }
  if (a.t === 'play' && !p.forced) {
    const idx = a.idx, n = H.seats[i].hand.length;
    if (!Array.isArray(idx) || idx.length < 1 || idx.length > 3 || new Set(idx).size !== idx.length) return;
    if (idx.some(x => !Number.isInteger(x) || x < 0 || x >= n)) return;
    resolvePending({ type: 'play', cards: idx });
  }
}
function seatToBot(i, why) {
  const s = H.seats[i]; if (!s || s.isBot) return;
  s.isBot = true; s.conn = null; s.local = false;
  if (H.running) {
    emit({ t: 'info', text: `${s.name} ${why}. Miejsce przejmuje bot.`, st: pub() });
    if (H.pending && H.pending.seat === i) {
      const p = H.pending; resolvePending(botDecide(i, p.canChallenge, p.forced));
    }
  }
}
function deal() {
  const D = DECKS[H.N], deck = []; TYPES.forEach(t => { for (let k = 0; k < D.per; k++) deck.push(t); }); for (let k = 0; k < D.jokers; k++) deck.push('J'); if (H.mode === 'special') deck.push('D', 'M', 'X'); shuffle(deck);
  H.seats.forEach(s => { if (s) s.hand = s.alive ? deck.splice(0, 5) : []; });
}
const nextSeat = i => (i + 1) % H.N;
async function hostRound(starter, tok) {
  H.round++; deal(); H.table = TYPES[(rnd() * 3) | 0]; H.plays = []; H.lastPlay = null; H.pileN = 0; H.active = -1;
  emit({ t: 'round', round: H.round, table: H.table, st: pub() });
  H.seats.forEach((_, i) => sendHand(i, true));
  await drained();
  let cur = starter, guard = 0;
  while (tok === H.token && guard++ < 300) {
    const s = H.seats[cur];
    if (!s || !s.alive) { cur = nextSeat(cur); continue; }
    let forced = false;
    const lp = H.lastPlay;
    if (s.hand.length === 0) {
      const others = lp && H.seats.some((q, k) => q && q.alive && k !== lp.seat && q.hand.length > 0);
      if (lp && cur !== lp.seat && !others) forced = true;
      else { cur = nextSeat(cur); continue; }
    }
    const canChallenge = !!lp && lp.seat !== cur;
    const a = await waitAction(cur, canChallenge, forced);
    if (tok !== H.token) return null;
    if (a.type === 'liar') {
      emit({ t: 'liar', seat: cur, target: lp.seat });
      const cards = lp.cards, truthful = cards.every(hTrue);
      const devil = cards.includes('D'), mirror = cards.includes('M'), dbl = cards.includes('X');
      let shooters, effect = null;
      if (devil) { // wszyscy oprócz zagrywającego, po kolei od następnego
        effect = 'devil'; shooters = [];
        for (let k = 1; k < H.N; k++) { const j = (lp.seat + k) % H.N; if (H.seats[j] && H.seats[j].alive) shooters.push(j); }
      } else if (mirror) { effect = 'mirror'; shooters = [cur]; }
      else shooters = [truthful ? cur : lp.seat];
      emit({ t: 'reveal', cards, truthful, target: lp.seat, challenger: cur, effect, double: dbl, shooters });
      for (const j of shooters) {
        for (let k = 0; k < (dbl ? 2 : 1); k++) {
          const L = H.seats[j]; if (!L.alive) break;
          const den = 6 - L.shots, dead = L.shots === L.bullet; L.shots++;
          if (dead) L.alive = false;
          emit({ t: 'shot', seat: j, dead, den, second: k === 1, st: pub() });
        }
      }
      await drained();
      return devil ? lp.seat : shooters[0];
    }
    const cards = a.cards.slice().sort((x, y) => y - x).map(k => s.hand.splice(k, 1)[0]).reverse();
    H.lastPlay = { seat: cur, cards }; H.plays.push(H.lastPlay); H.pileN += cards.length;
    emit({ t: 'play', seat: cur, n: cards.length, st: pub() });
    sendHand(cur, false);
    await drained();
    cur = nextSeat(cur);
  }
  return null;
}
async function hostGame() {
  const tok = ++H.token; H.running = true; H.round = 0;
  H.seats.forEach(s => { if (s) { s.alive = true; s.shots = 0; s.bullet = (rnd() * 6) | 0; s.hand = []; } });
  emit({ t: 'begin', st: pub(), mode: H.mode });
  await drained();
  let starter = H.seats.findIndex(s => s);
  while (tok === H.token) {
    const loser = await hostRound(starter, tok);
    if (tok !== H.token || loser == null) return;
    const alive = H.seats.map((s, i) => s && s.alive ? i : -1).filter(i => i >= 0);
    const humansAlive = alive.filter(i => !H.seats[i].isBot);
    if (alive.length <= 1 || humansAlive.length === 0) {
      H.running = false;
      emit({ t: 'end', winner: alive.length === 1 ? alive[0] : -1, rounds: H.round, st: pub() });
      lobbyBroadcast();
      return;
    }
    starter = loser;
    while (!H.seats[starter] || !H.seats[starter].alive) starter = nextSeat(starter);
    await sleep(700);
  }
}

// ================= SIEĆ (PeerJS, połączenie P2P) =================
const NET = { isHost: false, peer: null, conn: null, code: '', online: false };
const ROOM_PREFIX = 'barpodbebenkiem-v1-';
const CODE_CH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const genCode = () => Array.from({ length: 5 }, () => CODE_CH[(rnd() * CODE_CH.length) | 0]).join('');
function peerOpts() {
  const q = new URLSearchParams(location.search);
  const ice = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' }] };
  if (q.get('ps')) return { host: q.get('ps'), port: +(q.get('pp') || 9000), path: '/bar', secure: false, debug: 1, config: ice };
  return { debug: 1, config: ice };
}
function myName() {
  const n = ($('#nick').value || '').trim().replace(/\s+/g, ' ').slice(0, 14);
  try { localStorage.setItem('bpb-nick', n); } catch (e) {}
  return n || 'Gracz';
}
const cleanName = n => (String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 14)) || 'Gracz';

function status(t, el = '#menuStatus') { $(el).textContent = t; }
function showScreen(id) { ['#menuScreen', '#lobbyScreen', '#endScreen'].forEach(s => $(s).classList.toggle('hide', s !== id)); }
function hideScreens() { ['#menuScreen', '#lobbyScreen', '#endScreen'].forEach(s => $(s).classList.add('hide')); }

// --- host ---
function createRoom() {
  initAudio(); status('Zakładam pokój…');
  const name = myName();
  const code = genCode();
  const peer = new Peer(ROOM_PREFIX + code.toLowerCase(), peerOpts());
  NET.peer = peer; NET.isHost = true; NET.online = true; NET.code = code;
  peer.on('open', () => {
    H.N = chosenN; H.mode = chosenMode; H.seats = Array.from({ length: H.N }, (_, i) => i === 0 ? { name, kind: KINDS[0], isBot: false, local: true, conn: null, hand: [], alive: true, shots: 0, bullet: 0 } : null);
    V.mySeat = 0; location.hash = code;
    showScreen('#lobbyScreen'); lobbyBroadcast();
  });
  peer.on('connection', conn => {
    conn.lastSeen = Date.now();
    conn.on('data', d => hostOnData(conn, d));
    conn.on('close', () => hostOnClose(conn));
    conn.on('error', () => hostOnClose(conn));
  });
  peer.on('disconnected', () => { if (peer.open === false && !H.seats[0]) return; setTimeout(() => { if (!peer.destroyed && peer.disconnected) { try { peer.reconnect(); } catch (e) {} } }, 3000); });
  peer.on('error', e => {
    if (e.type === 'unavailable-id') { peer.destroy(); createRoom(); return; }
    if (e.type === 'network' || e.type === 'server-error' || e.type === 'socket-error') {
      if (!H.seats[0] || !NET.isHost || $('#lobbyScreen').classList.contains('hide') && !H.running) { status(`Nie mogę połączyć się z serwerem pokoi (${e.type}). Sprawdź internet i spróbuj ponownie.`); try { peer.destroy(); } catch (x) {} }
    }
    else console.warn('peer error', e.type, e);
  });
}
const newToken = () => Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 8);
function hostOnData(conn, d) {
  if (!d || typeof d !== 'object') return;
  conn.lastSeen = Date.now();
  if (d.t === 'pong') return;
  if (d.t === 'hello') {
    if (conn.seat != null) return;
    // powrót po odświeżeniu strony: ten sam token = to samo miejsce
    const tok = typeof d.token === 'string' ? d.token : '';
    const back = tok ? H.seats.findIndex((q, i) => i > 0 && q && q.token === tok) : -1;
    if (back > 0) {
      const q = H.seats[back];
      const old = q.conn; if (old && old !== conn) { old.seat = null; try { old.close(); } catch (e) {} }
      q.conn = conn; q.local = false; q.isBot = false; q.fill = false; conn.seat = back;
      safeSend(conn, { t: 'welcome', seat: back, code: NET.code, token: tok });
      if (H.running) {
        safeSend(conn, { t: 'sync', mode: H.mode, st: pub(), table: H.table, round: H.round, pileN: H.pileN || 0, lastN: H.lastPlay ? H.lastPlay.cards.length : 0, active: H.active });
        sendHand(back, false);
        const p = H.pending;
        if (p && p.seat === back) safeSend(conn, { t: 'turn', seat: back, canChallenge: p.canChallenge, forced: p.forced, ms: Math.max(1000, p.deadline - Date.now()), lastSeat: H.lastPlay ? H.lastPlay.seat : -1, lastN: H.lastPlay ? H.lastPlay.cards.length : 0 });
        emit({ t: 'info', text: `${q.name} wraca do gry.`, st: pub() });
      } else lobbyBroadcast();
      return;
    }
    const free = H.seats.map((_, i) => i).slice(1).find(i => !H.seats[i] || (H.seats[i].isBot && H.seats[i].fill));
    if (H.running || free == null) { safeSend(conn, { t: 'reject', reason: H.running ? 'Gra już trwa. Poczekaj na koniec partii.' : `Stół jest pełny (${H.N} ${H.N === 4 ? 'osoby' : 'osób'}).` }); setTimeout(() => conn.close(), 400); return; }
    const token = newToken();
    H.seats[free] = { name: cleanName(d.name), kind: KINDS[free], isBot: false, local: false, conn, token, hand: [], alive: true, shots: 0, bullet: 0 };
    conn.seat = free;
    safeSend(conn, { t: 'welcome', seat: free, code: NET.code, token });
    lobbyBroadcast();
  } else if (d.t === 'act' && conn.seat != null) hostOnAction(conn.seat, d.a);
}
function kickSeat(i) {
  const q = H.seats[i]; if (!q || q.local || i === 0) return;
  const c = q.conn;
  if (c) { safeSend(c, { t: 'kicked' }); c.seat = null; setTimeout(() => { try { c.close(); } catch (e) {} }, 400); }
  if (H.running) { q.token = null; seatToBot(i, 'został wyrzucony'); }
  else { H.seats[i] = null; lobbyBroadcast(); }
}
// sprawdzanie, czy goście wciąż żyją (odświeżenie strony nie zawsze zamyka połączenie)
let hbLast = Date.now();
setInterval(() => {
  if (!NET.isHost || !NET.online) return;
  const now = Date.now(), gap = now - hbLast; hbLast = now;
  H.seats.forEach(q => {
    if (!q || !q.conn) return;
    const c = q.conn;
    if (gap > 6000) { c.lastSeen = now; } // przeglądarka hosta była uśpiona – nie karzemy gości
    safeSend(c, { t: 'ping' });
    if (now - (c.lastSeen || now) > 10000) { try { c.close(); } catch (e) {} hostOnClose(c); }
  });
}, 2500);
function hostOnClose(conn) {
  const i = conn.seat; if (i == null) return; conn.seat = null;
  const s = H.seats[i]; if (!s || s.conn !== conn) return;
  if (H.running) seatToBot(i, 'rozłączył się');
  else { H.seats[i] = null; lobbyBroadcast(); }
}
function lobbyInfo() { return { t: 'lobby', mode: H.mode, n: H.N, code: NET.code, running: H.running, seats: H.seats.map(s => s && !(s.isBot && s.fill) ? { name: s.name, isBot: s.isBot } : null) }; }
function lobbyBroadcast() {
  const info = lobbyInfo();
  renderLobby(info);
  H.seats.forEach(s => { if (s && s.conn) safeSend(s.conn, info); });
}
function hostStartGame() {
  initAudio();
  // usuń boty-wypełniacze z poprzedniej partii, ludzi rozłączonych zostaw jako boty tylko do końca partii
  H.seats = H.seats.map(s => s && s.isBot && (s.fill || !s.conn) ? null : s);
  if ($('#fillBots').checked) H.seats = H.seats.map((s, i) => s || { name: BOT_NAMES[KINDS[i]], kind: KINDS[i], isBot: true, fill: true, local: false, conn: null, hand: [], alive: true, shots: 0, bullet: 0 });
  const n = H.seats.filter(Boolean).length;
  if (n < 2) { status('Potrzeba co najmniej 2 graczy. Zaproś kogoś albo włącz boty.', '#lobbyStatus'); return; }
  hostGame();
}
function startSolo() {
  initAudio();
  NET.isHost = true; NET.online = false; V.mySeat = 0;
  const name = myName();
  H.N = chosenN; H.mode = chosenMode;
  H.seats = KINDS.slice(0, H.N).map((k, i) => i === 0 ? { name, kind: k, isBot: false, local: true, conn: null, hand: [] } : { name: BOT_NAMES[k], kind: k, isBot: true, fill: true, conn: null, hand: [] });
  hostGame();
}

// --- klient ---
function joinRoom() {
  initAudio();
  const code = ($('#codeIn').value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 5) { status('Kod pokoju ma 5 znaków.'); return; }
  status('Łączę z pokojem ' + code + '…');
  const name = myName();
  if (NET.peer) { try { NET.peer.destroy(); } catch (e) {} }
  const peer = new Peer(peerOpts()); NET.peer = peer; NET.isHost = false; NET.online = true; NET.code = code;
  let ok = false;
  const to = setTimeout(() => { if (!ok) status('Nie udało się połączyć. Sprawdź kod albo spróbuj innej sieci (np. Wi-Fi zamiast LTE).'); }, 15000);
  peer.on('open', () => {
    const conn = peer.connect(ROOM_PREFIX + code.toLowerCase(), { reliable: true, serialization: 'json' });
    NET.conn = conn;
    let token = '';
    try { const r = JSON.parse(sessionStorage.getItem('bpb-rejoin') || 'null'); if (r && r.code === code) token = r.token; } catch (e) {}
    conn.on('open', () => { ok = true; clearTimeout(to); hostSeen = Date.now(); conn.send({ t: 'hello', name, token }); });
    conn.on('data', d => clientOnData(d));
    conn.on('close', () => hostLost());
    conn.on('error', () => hostLost());
  });
  peer.on('error', e => {
    clearTimeout(to);
    if (e.type === 'peer-unavailable') status('Nie ma pokoju o takim kodzie (albo host go zamknął).');
    else status(`Błąd połączenia (${e.type}). Spróbuj ponownie.`);
  });
}
let hostSeen = 0;
function clientOnData(d) {
  if (!d || typeof d !== 'object') return;
  hostSeen = Date.now();
  if (d.t === 'ping') { safeSend(NET.conn, { t: 'pong' }); return; }
  if (d.t === 'welcome') {
    V.mySeat = d.seat; showScreen('#lobbyScreen');
    try { sessionStorage.setItem('bpb-rejoin', JSON.stringify({ code: NET.code, token: d.token })); } catch (e) {}
    try { history.replaceState(null, '', '#' + NET.code); } catch (e) {}
    return;
  }
  if (d.t === 'kicked') {
    hostGone = true;
    try { sessionStorage.removeItem('bpb-rejoin'); } catch (e) {}
    try { NET.peer.destroy(); } catch (e) {}
    V.turn = null; updateButtons();
    showScreen('#menuScreen'); status('Host wyrzucił cię z pokoju.');
    return;
  }
  if (d.t === 'reject') { status(d.reason || 'Host odrzucił połączenie.'); showScreen('#menuScreen'); return; }
  if (d.t === 'lobby') { renderLobby(d); return; }
  handleEvent(d);
}
let hostGone = false;
setInterval(() => { if (NET.isHost || !NET.online || !hostSeen || hostGone) return; if (Date.now() - hostSeen > 45000) hostLost(); }, 3000);
function hostLost() {
  if (hostGone || NET.isHost) return; hostGone = true;
  V.turn = null; updateButtons();
  $('#endTitle').textContent = 'Host się rozłączył';
  $('#endText').textContent = 'Pokój został zamknięty. Wróć do menu i dołącz do nowego pokoju.';
  $('#againBtn').classList.add('hide'); $('#waitHost').classList.add('hide');
  showScreen('#endScreen');
}

// --- lobby UI ---
function renderLobby(info) {
  $('#roomCode').textContent = info.code;
  const list = $('#seatList'); list.innerHTML = '';
  info.seats.forEach((s, i) => {
    const li = document.createElement('div'); li.className = 'seat' + (s ? '' : ' empty') + (i === V.mySeat ? ' me' : '');
    const nm = document.createElement('span');
    nm.textContent = s ? (s.name + (i === V.mySeat ? ' (ty)' : '') + (i === 0 ? ' 👑' : '') + (s.isBot ? ' 🤖' : '')) : 'wolne miejsce';
    li.appendChild(nm);
    if (NET.isHost && s && i !== 0) {
      const k = document.createElement('button'); k.className = 'kick'; k.textContent = '✕'; k.title = 'Wyrzuć z pokoju';
      k.addEventListener('click', () => kickSeat(i));
      li.appendChild(k);
    }
    list.appendChild(li);
  });
  $('#hostControls').classList.toggle('hide', !NET.isHost);
  { const n = info.seats.length; $('#tableInfo').innerHTML = `Stół na ${n} ${n === 4 ? 'osoby' : 'osób'} · tryb: <b>${info.mode === 'special' ? 'specjalne karty' : 'klasyczny'}</b><br>${deckDesc(n, info.mode)}`; }
  paintSeg(); paintMode();
  $('#clientWait').classList.toggle('hide', NET.isHost);
}
const IS_WEB = /^https?:$/.test(location.protocol);
function shareLink() { return location.origin + location.pathname + '#' + NET.code; }
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; } catch (e) {}
  try {
    const ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok;
  } catch (e) { return false; }
}
$('#shareBtn').textContent = IS_WEB ? 'Wyślij zaproszenie' : 'Kopiuj kod';
$('#shareBtn').addEventListener('click', async () => {
  if (IS_WEB) {
    const url = shareLink();
    const mobile = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    if (mobile && navigator.share) { try { await navigator.share({ title: 'Bar pod Bębenkiem', text: `Wbijaj do baru! Kod: ${NET.code}`, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
    status(await copyText(url) ? 'Link skopiowany. Wklej go kolegom.' : url, '#lobbyStatus');
  } else {
    const t = `Bar pod Bębenkiem: otwórz plik gry, kliknij Dołącz i wpisz kod ${NET.code}`;
    status(await copyText(t) ? `Skopiowano. Wklej kolegom, oni wpisują kod ${NET.code}.` : `Podaj kolegom kod: ${NET.code}`, '#lobbyStatus');
  }
});

// --- koniec gry ---
function showEnd(ev) {
  const w = ev.winner;
  let title, text;
  if (w === V.mySeat) { title = 'Wygrałeś!'; text = `Przetrwałeś ${ev.rounds} rund i zgarnąłeś cały stół.`; }
  else if (w >= 0) { title = `${V.seats[w].name} wygrywa`; text = V.seats[V.mySeat] && V.seats[V.mySeat].alive ? 'Remis nie istnieje w tym barze.' : 'Bęben zatrzymał się na złej komorze.'; }
  else { title = 'Koniec gry'; text = 'Przy stole zostały same boty.'; }
  $('#endTitle').textContent = title; $('#endText').textContent = text;
  $('#againBtn').classList.toggle('hide', !NET.isHost);
  $('#waitHost').classList.toggle('hide', NET.isHost);
  setTimeout(() => showScreen('#endScreen'), 900);
}

// --- wybór rozmiaru stołu ---
let chosenN = 4;
try { const v = +localStorage.getItem('bpb-n'); chosenN = [4, 6, 8].includes(v) ? v : 4; } catch (e) {}
function paintSeg() { document.querySelectorAll('.seg button').forEach(b => b.classList.toggle('on', +b.dataset.n === (NET.isHost && NET.online ? H.N : chosenN))); }
document.querySelectorAll('#sizeSeg button').forEach(b => b.addEventListener('click', () => { chosenN = +b.dataset.n; try { localStorage.setItem('bpb-n', chosenN); } catch (e) {} paintSeg(); }));
document.querySelectorAll('#sizeSegLobby button').forEach(b => b.addEventListener('click', () => hostSetSize(+b.dataset.n)));
function hostSetSize(n) {
  if (!NET.isHost || H.running || n === H.N) return;
  if (n < H.N) {
    const humans = H.seats.map((s, i) => s && !(s.isBot && s.fill) ? i : -1).filter(i => i >= 0);
    if (humans.length > n) { status(`Przy stole jest ${humans.length} osób. Najpierw kogoś wyrzuć.`, '#lobbyStatus'); return; }
    const seats = Array.from({ length: n }, () => null);
    humans.forEach((oldI, k) => {
      const s = H.seats[oldI]; seats[k] = s; s.kind = KINDS[k];
      if (k !== oldI && s.conn) { s.conn.seat = k; safeSend(s.conn, { t: 'welcome', seat: k, code: NET.code, token: s.token }); }
    });
    H.seats = seats;
  } else {
    H.seats = Array.from({ length: n }, (_, i) => H.seats[i] && !(H.seats[i].isBot && H.seats[i].fill) ? H.seats[i] : null);
  }
  H.N = n; chosenN = n; try { localStorage.setItem('bpb-n', n); } catch (e) {}
  status('', '#lobbyStatus'); paintSeg(); lobbyBroadcast();
}
// --- wybór trybu ---
let chosenMode = 'classic';
try { chosenMode = localStorage.getItem('bpb-mode') === 'special' ? 'special' : 'classic'; } catch (e) {}
function paintMode() { const m = NET.isHost && NET.online ? H.mode : chosenMode; document.querySelectorAll('.modeseg button').forEach(b => b.classList.toggle('on', b.dataset.m === m)); }
document.querySelectorAll('#modeSeg button').forEach(b => b.addEventListener('click', () => { chosenMode = b.dataset.m; try { localStorage.setItem('bpb-mode', chosenMode); } catch (e) {} paintMode(); }));
document.querySelectorAll('#modeSegLobby button').forEach(b => b.addEventListener('click', () => {
  if (!NET.isHost || H.running) return;
  H.mode = chosenMode = b.dataset.m; try { localStorage.setItem('bpb-mode', chosenMode); } catch (e) {}
  paintMode(); lobbyBroadcast();
}));
paintSeg(); paintMode();

// --- przyciski menu ---
$('#createBtn').addEventListener('click', createRoom);
$('#soloBtn').addEventListener('click', startSolo);
$('#joinBtn').addEventListener('click', joinRoom);
$('#codeIn').addEventListener('keydown', e => { if (e.key === 'Enter') joinRoom(); });
$('#startBtn').addEventListener('click', hostStartGame);
$('#againBtn').addEventListener('click', () => { if (NET.online) showScreen('#lobbyScreen'), lobbyBroadcast(); else startSolo(); });
$('#menuBtn').addEventListener('click', () => { location.href = location.pathname; });
$('#leaveBtn').addEventListener('click', () => { location.href = location.pathname; });
$('#helpBtn').addEventListener('click', () => $('#rulesBox').classList.toggle('open'));
$('#rulesBtn').addEventListener('click', () => $('#rulesBox').classList.toggle('open'));
$('#rulesClose').addEventListener('click', () => $('#rulesBox').classList.remove('open'));
$('#soundBtn').addEventListener('click', () => { initAudio(); muted = !muted; $('#soundBtn').textContent = muted ? '🔇' : '🔊'; });
try { $('#nick').value = localStorage.getItem('bpb-nick') || ''; } catch (e) {}
{
  const h = (location.hash || '').replace('#', '').toUpperCase();
  if (/^[A-Z0-9]{5}$/.test(h)) { $('#codeIn').value = h; $('#joinHint').classList.remove('hide'); }
}
if (typeof Peer === 'undefined') { $('#createBtn').disabled = true; $('#joinBtn').disabled = true; status('Tryb online niedostępny w tym miejscu. Możesz zagrać z botami.'); }

// ---------- kamera i rozglądanie ----------
const camBase = new V3(), camTarget = new V3();
let lookYaw = 0, lookPitch = 0, shake = 0;
function layout() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h;
  const portrait = w / h < 0.9;
  let hfov;
  if (TABLE_N === 8) {
    if (portrait) { camBase.set(0, 6.0, 4.6); camTarget.set(0, 0.35, -0.85); hfov = 72; }
    else { camBase.set(0, 3.2, 4.6); camTarget.set(0, 0.6, -0.6); hfov = 90; }
  } else if (TABLE_N === 6) {
    if (portrait) { camBase.set(0, 4.9, 4.4); camTarget.set(0, 0.2, -0.25); hfov = 66; }
    else { camBase.set(0, 2.55, 3.95); camTarget.set(0, 0.75, -0.55); hfov = 84; }
  } else if (portrait) { camBase.set(0, 2.45, 4.0); camTarget.set(0, 0.62, -0.6); hfov = 64; }
  else { camBase.set(0, 2.1, 3.3); camTarget.set(0, 0.78, -0.45); hfov = 76; }
  shade.visible = bulb.visible = camBase.y < 3.5;
  const vfov = 2 * Math.atan(Math.tan(hfov * Math.PI / 360) / camera.aspect) * 180 / Math.PI;
  camera.fov = Math.min(Math.max(vfov, 46), 90); camera.updateProjectionMatrix();
}
window.addEventListener('resize', layout); layout();
let drag = null;
canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, yaw: lookYaw, pitch: lookPitch }; });
window.addEventListener('pointermove', e => {
  if (!drag) return;
  lookYaw = Math.max(-0.7, Math.min(0.7, drag.yaw - (e.clientX - drag.x) * 0.004));
  lookPitch = Math.max(-0.3, Math.min(0.35, drag.pitch + (e.clientY - drag.y) * 0.003));
});
window.addEventListener('pointerup', () => drag = null);
window.addEventListener('pointercancel', () => drag = null);

// ---------- pętla ----------
const tmp = new V3(), tmp2 = new V3();
const clock = new THREE.Clock();
function loop(now) {
  requestAnimationFrame(loop);
  const t = clock.getElapsedTime();
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i]; const k = Math.min(1, (now - tw.t0) / tw.dur);
    tw.fn(tw.e(k)); if (k >= 1) { tweens.splice(i, 1); tw.res(); }
  }
  const fl = 1 + Math.sin(t * 13) * 0.015 + Math.sin(t * 31) * 0.01 + (Math.sin(t * 0.7) > 0.985 ? -0.25 : 0);
  spot.intensity = 2.6 * fl; bulb.material.color.setScalar(0.85 + 0.15 * fl);
  const pa = dustGeo.attributes.position.array;
  for (let i = 0; i < dustN; i++) { pa[i * 3 + 1] += Math.sin(t * 0.5 + i) * 0.0004 + 0.0002; if (pa[i * 3 + 1] > 2.5) pa[i * 3 + 1] = 0.9; pa[i * 3] += Math.sin(t * 0.3 + i * 1.7) * 0.0003; }
  dustGeo.attributes.position.needsUpdate = true;
  if (!drag) { lookYaw *= 0.995; lookPitch *= 0.995; }
  camera.position.set(camBase.x + Math.sin(t * 0.4) * 0.02, camBase.y + Math.sin(t * 0.55) * 0.015, camBase.z);
  if (shake > 0.0005) { camera.position.x += (rnd() - 0.5) * shake; camera.position.y += (rnd() - 0.5) * shake; shake *= 0.9; }
  const dist = camBase.distanceTo(camTarget);
  tmp.copy(camTarget); tmp.x += Math.sin(lookYaw) * dist; tmp.z += (1 - Math.cos(lookYaw)) * dist; tmp.y += lookPitch * dist;
  camera.lookAt(tmp);
  // licznik czasu tury
  if (V.turn && V.deadline) {
    const left = Math.max(0, Math.ceil((V.deadline - Date.now()) / 1000));
    $('#timer').textContent = `⏱ ${left}s`; $('#timer').classList.toggle('low', left <= 10);
  } else $('#timer').textContent = '';
  chars.forEach((c, i) => {
    const s = V.seats[i]; const L = labels[i];
    if (!c.root.visible || !s) { L.el.style.display = 'none'; return; }
    if (s.alive) {
      c.upper.position.y = 0.55 + Math.sin(t * 1.6 + i * 2) * 0.006;
      if (gun.g.position.distanceTo(GUN_REST_POS) > 0.05) tmp2.copy(gun.g.position);
      else if (V.active >= 0 && V.active !== i) { if (V.active === V.mySeat) tmp2.copy(camera.position); else chars[V.active].head.getWorldPosition(tmp2); }
      else if (V.active === i) tmp2.set(0, PILE_Y - 0.2, 0);
      else tmp2.set(0, 1.2, 0);
      const local = c.root.worldToLocal(tmp2.clone()).sub(new V3(0, 1.45, 0));
      const ty = Math.max(-1.2, Math.min(1.2, Math.atan2(local.x, local.z)));
      const tp = Math.max(-0.5, Math.min(0.5, -Math.atan2(local.y, Math.hypot(local.x, local.z))));
      c.yaw += (ty - c.yaw) * 0.06; c.pitch += (tp - c.pitch) * 0.06;
      c.head.rotation.y = c.yaw; c.head.rotation.x = c.pitch;
      c.fan.rotation.z = Math.sin(t * 1.3 + i) * 0.03;
    }
    c.head.getWorldPosition(tmp2); tmp2.y += 0.56;
    tmp2.project(camera);
    const x = (tmp2.x * 0.5 + 0.5) * window.innerWidth, y = (-tmp2.y * 0.5 + 0.5) * window.innerHeight;
    L.el.style.left = Math.max(60, Math.min(window.innerWidth - 60, x)) + 'px';
    L.el.style.top = Math.max(70, y) + 'px';
    L.el.style.display = tmp2.z < 1 ? '' : 'none';
  });
  renderer.render(scene, camera);
}
requestAnimationFrame(loop);
