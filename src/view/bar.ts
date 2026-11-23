// Tło: zadymiony drewniany bar wokół stołu. Wszystko z prostych brył i tekstur
// rysowanych w canvasie, bez plików. `updateBar()` animuje deszcz, dym, świece i szafę grającą.

import * as THREE from 'three';
import { mat, mesh, scene, woodM } from './scene';
import { canvasTex, floorTex, rr, woodTex } from './textures';

type Ctx = CanvasRenderingContext2D;
const R = Math.random;
const W = 12, H = 4.8; // sala 12 × 12 m, sufit na 4,8 m
const BACK = -W / 2, LEFT = -W / 2, RIGHT = W / 2;

// ---------- tekstury ----------
const plankTex = canvasTex(512, 512, (g: Ctx, w: number, h: number) => {
  for (let x = 0; x < w; x += 42) {
    const v = 26 + R() * 16;
    g.fillStyle = `rgb(${v + 20},${v + 8},${v - 4})`; g.fillRect(x, 0, 42, h);
    for (let i = 0; i < 26; i++) {
      g.strokeStyle = `rgba(0,0,0,${R() * 0.25})`; g.lineWidth = 1 + R() * 2;
      const xx = x + R() * 42; g.beginPath(); g.moveTo(xx, 0); g.bezierCurveTo(xx + 4, h / 3, xx - 4, (2 * h) / 3, xx + (R() - 0.5) * 6, h); g.stroke();
    }
    for (let k = 0; k < 2; k++) { g.fillStyle = 'rgba(0,0,0,.6)'; g.beginPath(); g.arc(x + 21, 30 + k * (h - 60), 3, 0, 7); g.fill(); } // gwoździe
    g.fillStyle = 'rgba(0,0,0,.75)'; g.fillRect(x, 0, 3, h);
  }
  const grime = g.createLinearGradient(0, 0, 0, h); // brud: ciemniej u góry i przy podłodze
  grime.addColorStop(0, 'rgba(0,0,0,.55)'); grime.addColorStop(0.35, 'rgba(0,0,0,0)'); grime.addColorStop(0.85, 'rgba(0,0,0,.05)'); grime.addColorStop(1, 'rgba(0,0,0,.45)');
  g.fillStyle = grime; g.fillRect(0, 0, w, h);
});
plankTex.wrapS = plankTex.wrapT = THREE.RepeatWrapping; plankTex.repeat.set(5, 1);

const rugTex = canvasTex(512, 512, (g: Ctx, w: number) => {
  const c = w / 2;
  const rings: [number, string][] = [[256, '#3a0f12'], [236, '#c49a4a'], [228, '#5a1418'], [200, '#2a0a0c'], [190, '#7a1c20'], [120, '#5a1418'], [112, '#c49a4a'], [104, '#3a0f12']];
  for (const [r, col] of rings) { g.fillStyle = col; g.beginPath(); g.arc(c, c, r, 0, 7); g.fill(); }
  g.strokeStyle = 'rgba(196,154,74,.55)'; g.lineWidth = 3;
  for (let k = 0; k < 16; k++) { const a = (k * Math.PI) / 8; g.beginPath(); g.moveTo(c + Math.cos(a) * 125, c + Math.sin(a) * 125); g.lineTo(c + Math.cos(a) * 185, c + Math.sin(a) * 185); g.stroke(); }
  const id = g.getImageData(0, 0, w, w); // wytarcia
  for (let i = 0; i < id.data.length; i += 4) { const n = (R() - 0.5) * 30; id.data[i] += n; id.data[i + 1] += n; id.data[i + 2] += n; }
  g.putImageData(id, 0, 0);
});

const smokeTex = canvasTex(256, 256, (g: Ctx, w: number, h: number) => {
  for (let i = 0; i < 40; i++) {
    const x = w / 2 + (R() - 0.5) * w * 0.5, y = h / 2 + (R() - 0.5) * h * 0.3, r = 30 + R() * 70;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,240,220,.10)'); gr.addColorStop(1, 'rgba(255,240,220,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }
});

const rainTex = canvasTex(128, 256, (g: Ctx, w: number, h: number) => {
  g.fillStyle = '#0b1830'; g.fillRect(0, 0, w, h);
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(90,130,200,.35)'); gr.addColorStop(1, 'rgba(20,40,80,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(170,200,255,.35)'; g.lineWidth = 1;
  for (let i = 0; i < 70; i++) { const x = R() * w, y = R() * h, l = 8 + R() * 20; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 2, y + l); g.stroke(); }
});
rainTex.wrapS = rainTex.wrapT = THREE.RepeatWrapping;

function poster(lines: [string, number, string][], paper = '#d9c49a', w = 256, h = 340): THREE.CanvasTexture {
  return canvasTex(w, h, (g: Ctx) => {
    g.fillStyle = paper; g.fillRect(0, 0, w, h);
    const id = g.getImageData(0, 0, w, h);
    for (let i = 0; i < id.data.length; i += 4) { const n = (R() - 0.5) * 26; id.data[i] += n; id.data[i + 1] += n; id.data[i + 2] += n; }
    g.putImageData(id, 0, 0);
    const edge = g.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w * 0.85);
    edge.addColorStop(0, 'rgba(60,30,0,0)'); edge.addColorStop(1, 'rgba(60,30,0,.45)');
    g.fillStyle = edge; g.fillRect(0, 0, w, h);
    g.fillStyle = '#2a170a'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const [text, size, y] of lines) { g.font = `bold ${size}px Georgia, serif`; g.fillText(text, w / 2, Number(y)); }
  });
}
const wantedTex = (() => {
  const t = poster([['POSZUKIWANY', 34, '40'], ['UCZCIWY GRACZ', 22, '250'], ['NAGRODA: 500 zł', 20, '290']]);
  const g = (t.image as HTMLCanvasElement).getContext('2d')!;
  g.fillStyle = '#2a170a'; g.beginPath(); g.arc(128, 135, 42, 0, 7); g.fill(); g.fillRect(70, 170, 116, 60); // sylwetka
  g.fillStyle = '#d9c49a'; g.font = 'bold 54px Georgia'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', 128, 138);
  t.needsUpdate = true; return t;
})();
const rulesTex = poster([['ZASADY BARU', 30, '40'], ['1. Nie kłam.', 19, '110'], ['2. A jak kłamiesz –', 19, '150'], ['nie daj się złapać.', 19, '180'], ['3. Kredytu', 19, '230'], ['nie udzielamy.', 19, '260']], '#cfc0a0');
const menuTex = poster([['DZIŚ W BARZE', 26, '40'], ['Piwo · 6 zł', 21, '115'], ['Nalewka · 9 zł', 21, '160'], ['Blef · gratis', 21, '205'], ['Kula · 1/6', 21, '250']], '#c8b48a');

const dartTex = canvasTex(256, 256, (g: Ctx, w: number) => {
  const c = w / 2;
  for (let k = 0; k < 20; k++) {
    const a0 = (k * Math.PI) / 10 - Math.PI / 20, a1 = a0 + Math.PI / 10;
    for (const [r0, r1, cols] of [[0, 118, ['#1a1a1a', '#e8dcc0']], [72, 80, ['#a01818', '#1a6a2a']], [110, 118, ['#a01818', '#1a6a2a']]] as const) {
      g.fillStyle = cols[k % 2]; g.beginPath(); g.arc(c, c, r1, a0, a1); g.arc(c, c, r0, a1, a0, true); g.fill();
    }
  }
  g.fillStyle = '#1a6a2a'; g.beginPath(); g.arc(c, c, 14, 0, 7); g.fill();
  g.fillStyle = '#a01818'; g.beginPath(); g.arc(c, c, 6, 0, 7); g.fill();
});

const clockTex = canvasTex(256, 256, (g: Ctx, w: number) => {
  const c = w / 2;
  g.fillStyle = '#e6d8b8'; g.beginPath(); g.arc(c, c, 120, 0, 7); g.fill();
  g.strokeStyle = '#3a2410'; g.lineWidth = 10; g.stroke();
  g.fillStyle = '#2a170a'; g.font = 'bold 26px Georgia'; g.textAlign = 'center'; g.textBaseline = 'middle';
  ['XII', 'III', 'VI', 'IX'].forEach((t, k) => { const a = (k * Math.PI) / 2 - Math.PI / 2; g.fillText(t, c + Math.cos(a) * 92, c + Math.sin(a) * 92); });
  g.lineCap = 'round'; g.strokeStyle = '#2a170a';
  g.lineWidth = 7; g.beginPath(); g.moveTo(c, c); g.lineTo(c + 40, c - 30); g.stroke();
  g.lineWidth = 4; g.beginPath(); g.moveTo(c, c); g.lineTo(c - 12, c - 80); g.stroke();
});

const signTex = canvasTex(1024, 220, (g: Ctx, w: number, h: number) => {
  g.clearRect(0, 0, w, h); g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '96px Sancreek, Georgia, serif'; g.shadowColor = '#ff7a1a'; g.shadowBlur = 36;
  g.fillStyle = '#ffb060'; g.fillText('Bar pod Bębenkiem', w / 2, h / 2 + 6); g.shadowBlur = 12; g.fillText('Bar pod Bębenkiem', w / 2, h / 2 + 6);
  g.fillStyle = '#fff1d8'; g.shadowBlur = 0; g.globalAlpha = 0.5; g.fillText('Bar pod Bębenkiem', w / 2, h / 2 + 6);
});
if (document.fonts?.load) document.fonts.load('96px Sancreek').then(() => signTex.redraw()).catch(() => {});

const jukeTex = canvasTex(128, 256, (g: Ctx, w: number, h: number) => {
  g.fillStyle = '#100404'; g.fillRect(0, 0, w, h);
  const cols = ['#ff3060', '#ffb020', '#30d0ff', '#80ff60'];
  for (let i = 0; i < 4; i++) { g.fillStyle = cols[i]; rr(g, 10 + i * 28, 20, 18, h - 40, 9); g.fill(); }
});

// ---------- budowa ----------
const add = <T extends THREE.Object3D>(o: T): T => { scene.add(o); return o; };
const basic = (o: THREE.MeshBasicMaterialParameters) => new THREE.MeshBasicMaterial({ toneMapped: false, ...o });

// podłoga, ściany, sufit
const floor = add(new THREE.Mesh(new THREE.PlaneGeometry(W + 2, W + 2), mat(0x8a7060, { map: floorTex, roughness: 0.9 })));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
const wallM = mat(0x8a6a50, { map: plankTex, roughness: 0.95 });
for (const [x, z, ry] of [[0, BACK, 0], [LEFT, 0, Math.PI / 2], [RIGHT, 0, -Math.PI / 2], [0, -BACK, Math.PI]] as const) {
  const wall = add(new THREE.Mesh(new THREE.PlaneGeometry(W, H), wallM));
  wall.position.set(x, H / 2, z); wall.rotation.y = ry; wall.receiveShadow = true;
}
const upper = new THREE.Group(); add(upper); // sufit i belki (chowane, gdy kamera jest wyżej)
const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(W, W), mat(0x2a1a10, { map: woodTex }));
ceiling.rotation.x = Math.PI / 2; ceiling.position.y = H; upper.add(ceiling);
for (const z of [-4.5, -2, 0.5, 3]) upper.add(mesh(new THREE.BoxGeometry(W, 0.28, 0.3), woodM, 0, H - 0.14, z));
for (const x of [-3, 3]) upper.add(mesh(new THREE.BoxGeometry(0.3, 0.22, W), woodM, x, H - 0.4, 0));
// listwa przypodłogowa / boazeria do połowy
for (const [x, z, ry] of [[0, BACK + 0.03, 0], [LEFT + 0.03, 0, Math.PI / 2], [RIGHT - 0.03, 0, -Math.PI / 2]] as const) {
  const b = mesh(new THREE.BoxGeometry(W, 0.08, 0.06), woodM, x, 1.05, z); b.rotation.y = ry; add(b);
}

// dywan pod stołem
const rug = add(new THREE.Mesh(new THREE.CircleGeometry(3.1, 48), mat(0xffffff, { map: rugTex, roughness: 1 })));
rug.rotation.x = -Math.PI / 2; rug.position.y = 0.006; rug.receiveShadow = true;

// ---------- bar: kontuar, półki z podświetleniem, stołki ----------
const shelfZ = BACK + 0.4;
add(mesh(new THREE.BoxGeometry(5.6, 2.6, 0.12), mat(0x1c120a, { map: woodTex }), 0, 2.1, BACK + 0.08)); // tył regału
const glowStrip = basic({ color: 0xffa040 });
for (const y of [1.3, 1.85, 2.4]) {
  add(mesh(new THREE.BoxGeometry(5.2, 0.06, 0.4), woodM, 0, y, shelfZ));
  const strip = add(new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.02, 0.02), glowStrip)); strip.position.set(0, y + 0.42, BACK + 0.16);
}
const bottleCols = [0x2d5a2a, 0x6a3a10, 0x8a5a14, 0x1d3a4a, 0x5a1a1a, 0xa08a50, 0x3a6a5a];
for (const y of [1.33, 1.88, 2.43]) {
  for (let x = -2.4; x < 2.4; x += 0.16 + R() * 0.12) {
    if (R() < 0.12) continue;
    const h = 0.22 + R() * 0.16, r = 0.045 + R() * 0.028;
    const m = new THREE.MeshStandardMaterial({ color: bottleCols[(R() * bottleCols.length) | 0], roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.82, emissive: 0x2a1404, emissiveIntensity: 0.6 });
    const b = mesh(new THREE.CylinderGeometry(r, r, h, 10), m, x, y + h / 2, shelfZ + (R() - 0.5) * 0.12);
    b.add(mesh(new THREE.CylinderGeometry(r * 0.35, r * 0.45, h * 0.45, 8), m, 0, h * 0.7, 0));
    add(b);
  }
}
const counterZ = BACK + 1.25;
add(mesh(new THREE.BoxGeometry(6.2, 1.05, 0.7), mat(0x3a2210, { map: woodTex }), 0, 0.525, counterZ));
add(mesh(new THREE.BoxGeometry(6.4, 0.07, 0.85), mat(0x5a3418, { map: woodTex, roughness: 0.4 }), 0, 1.08, counterZ));
add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 6.2, 8), mat(0x8a6a30, { metalness: 0.8, roughness: 0.3 }), 0, 0.22, counterZ + 0.45)).rotation.z = Math.PI / 2; // rura na nogi
const glassM = new THREE.MeshStandardMaterial({ color: 0xcfe0e8, transparent: true, opacity: 0.35, roughness: 0.05 });
for (const x of [-2.2, -1.1, 0.6, 1.9]) add(mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.12, 12), glassM, x, 1.175, counterZ - 0.1));
add(mesh(new THREE.BoxGeometry(0.4, 0.28, 0.3), mat(0x6a4a20, { metalness: 0.6, roughness: 0.4 }), 2.6, 1.26, counterZ - 0.05)); // kasa
const stoolM = mat(0x2a1a10, { map: woodTex }), metalM = mat(0x3a3a3a, { metalness: 0.7, roughness: 0.4 });
for (const x of [-2.4, -1.2, 0, 1.2, 2.4]) {
  add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 18), stoolM, x, 0.78, counterZ + 0.75));
  add(mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.76, 8), metalM, x, 0.38, counterZ + 0.75));
  add(mesh(new THREE.TorusGeometry(0.14, 0.015, 6, 16), metalM, x, 0.3, counterZ + 0.75)).rotation.x = Math.PI / 2;
}
const shelfLight = add(new THREE.PointLight(0xff9a40, 1.3, 6, 2)); shelfLight.position.set(0, 2.6, BACK + 0.9);

// neon z nazwą baru
const sign = add(new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.77), new THREE.MeshBasicMaterial({ map: signTex, transparent: true, toneMapped: false, depthWrite: false })));
sign.position.set(0, 3.85, BACK + 0.15);

// ---------- ściany: plakaty, tarcza, zegar ----------
function framed(tex: THREE.Texture, w: number, h: number, x: number, y: number, z: number, ry: number, tilt = 0): void {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.set(0, ry, tilt); add(g);
  g.add(mesh(new THREE.BoxGeometry(w + 0.08, h + 0.08, 0.04), mat(0x2a1a0c), 0, 0, 0));
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat(0xffffff, { map: tex, roughness: 0.9 })); p.position.z = 0.025; g.add(p);
}
framed(wantedTex, 0.75, 1.0, -4.3, 2.3, BACK + 0.03, 0, 0.04);
framed(rulesTex, 0.75, 1.0, 4.3, 2.3, BACK + 0.03, 0, -0.03);
framed(menuTex, 0.7, 0.93, RIGHT - 0.03, 2.4, -1.2, -Math.PI / 2, 0.02);
const dart = add(new THREE.Mesh(new THREE.CircleGeometry(0.32, 40), mat(0xffffff, { map: dartTex, roughness: 0.8 })));
dart.position.set(RIGHT - 0.03, 2.1, 1.6); dart.rotation.y = -Math.PI / 2;
const clock = add(new THREE.Mesh(new THREE.CircleGeometry(0.33, 40), mat(0xffffff, { map: clockTex, roughness: 0.6 })));
clock.position.set(-3.0, 3.9, BACK + 0.03);

// ---------- okno z deszczem (zimne światło z zewnątrz) ----------
const win = new THREE.Group(); win.position.set(LEFT + 0.02, 2.3, -1.6); win.rotation.y = Math.PI / 2; add(win);
const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.7), basic({ map: rainTex, color: 0x9ab4ff })); pane.position.z = 0.01; win.add(pane);
const frameM = mat(0x1a100a, { map: woodTex });
for (const [w, h, x, y] of [[1.7, 0.1, 0, 0.9], [1.7, 0.1, 0, -0.9], [0.1, 1.9, 0.8, 0], [0.1, 1.9, -0.8, 0], [1.6, 0.05, 0, 0], [0.05, 1.8, 0, 0]] as const) {
  win.add(mesh(new THREE.BoxGeometry(w, h, 0.08), frameM, x, y, 0.04));
}
win.add(mesh(new THREE.BoxGeometry(1.8, 0.06, 0.25), woodM, 0, -0.97, 0.12)); // parapet
const moon = add(new THREE.PointLight(0x5a7aff, 0.55, 7, 2)); moon.position.set(LEFT + 0.8, 2.4, -1.6);

// ---------- szafa grająca ----------
const juke = new THREE.Group(); juke.position.set(RIGHT - 0.7, 0, BACK + 0.9); juke.rotation.y = -0.6; add(juke);
juke.add(mesh(new THREE.BoxGeometry(0.9, 1.3, 0.55), mat(0x5a1010, { roughness: 0.4, metalness: 0.2 }), 0, 0.65, 0));
const top = mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.55, 24, 1, false, 0, Math.PI), mat(0x5a1010, { roughness: 0.4 }), 0, 1.3, 0);
top.rotation.set(Math.PI / 2, Math.PI / 2, 0); juke.add(top);
const jukeGlow = new THREE.MeshBasicMaterial({ map: jukeTex, toneMapped: false });
const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.0), jukeGlow); panel.position.set(0, 0.85, 0.28); juke.add(panel);
juke.add(mesh(new THREE.BoxGeometry(0.6, 0.25, 0.05), mat(0xb08a40, { metalness: 0.8, roughness: 0.3 }), 0, 0.25, 0.28));
const jukeLight = add(new THREE.PointLight(0xff4080, 0.6, 3.5, 2)); jukeLight.position.set(RIGHT - 1.2, 1.0, BACK + 1.5);

// ---------- puste stoliki w kątach, ze świecami ----------
const flames: { m: THREE.MeshBasicMaterial; light: THREE.PointLight | null; seed: number }[] = [];
function sideTable(x: number, z: number, withLight: boolean): void {
  const g = new THREE.Group(); g.position.set(x, 0, z); add(g);
  g.add(mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.05, 24), mat(0x4a2a14, { map: woodTex }), 0, 0.76, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.74, 10), woodM, 0, 0.37, 0));
  for (const a of [0.4, 2.6]) {
    const c = new THREE.Group(); c.position.set(Math.cos(a) * 0.85, 0, Math.sin(a) * 0.85); c.lookAt(x, 0, z); g.add(c);
    c.add(mesh(new THREE.BoxGeometry(0.42, 0.05, 0.42), woodM, 0, 0.46, 0));
    c.add(mesh(new THREE.BoxGeometry(0.42, 0.55, 0.05), woodM, 0, 0.75, -0.2));
    for (const [lx, lz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]] as const) c.add(mesh(new THREE.BoxGeometry(0.04, 0.46, 0.04), woodM, lx, 0.23, lz));
  }
  g.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.14, 10), mat(0xe8dcc0), 0.1, 0.85, 0)); // świeca
  const fm = basic({ color: 0xffb040, transparent: true, opacity: 0.95 });
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.06, 8), fm); flame.position.set(0.1, 0.95, 0); g.add(flame);
  g.add(mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.12, 12), glassM, -0.2, 0.84, 0.1));
  g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.26, 10), new THREE.MeshStandardMaterial({ color: 0x2d5a2a, transparent: true, opacity: 0.85, roughness: 0.15 }), -0.05, 0.91, -0.2));
  // światło tylko przy części świec – każde światło kosztuje na słabszych telefonach
  let light: THREE.PointLight | null = null;
  if (withLight) { light = new THREE.PointLight(0xff9a40, 0.5, 3, 2); light.position.set(0.1, 1.05, 0); g.add(light); }
  flames.push({ m: fm, light, seed: R() * 10 });
}
sideTable(-4.6, 2.2, true);
sideTable(4.5, 3.4, false);
sideTable(-4.7, -3.6, false);

// beczki
const barrelM = mat(0x4a2a12, { map: woodTex }), hoopM = mat(0x222222, { metalness: 0.7, roughness: 0.4 });
for (const [x, z, y, lie] of [[4.9, -2.4, 0.5, false], [5.0, -1.4, 0.5, false], [4.95, -1.9, 1.42, false], [-5.1, 4.6, 0.45, true]] as const) {
  const b = mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.0, 18), barrelM, x, y, z);
  if (lie) b.rotation.z = Math.PI / 2;
  add(b);
  for (const yy of [-0.32, 0.32]) b.add(mesh(new THREE.CylinderGeometry(0.462, 0.462, 0.06, 18), hoopM, 0, yy, 0));
}

// ---------- kinkiety na ścianach (bez prawdziwych świateł – sama poświata, żeby nie obciążać telefonów) ----------
const glowTex = canvasTex(128, 128, (g: Ctx, w: number) => {
  const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  gr.addColorStop(0, 'rgba(255,200,120,.9)'); gr.addColorStop(0.25, 'rgba(255,160,70,.35)'); gr.addColorStop(1, 'rgba(255,140,50,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, w);
});
const sconceGlows: THREE.Sprite[] = [];
for (const [x, z, ry] of [[LEFT + 0.05, -3.4, Math.PI / 2], [LEFT + 0.05, 2.4, Math.PI / 2], [RIGHT - 0.05, -3.6, -Math.PI / 2], [RIGHT - 0.05, 0.2, -Math.PI / 2]] as const) {
  const g = new THREE.Group(); g.position.set(x, 2.7, z); g.rotation.y = ry; add(g);
  g.add(mesh(new THREE.BoxGeometry(0.16, 0.24, 0.05), mat(0x6a4a20, { metalness: 0.7, roughness: 0.35 }), 0, 0, 0.02));
  g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.18, 6), mat(0x6a4a20, { metalness: 0.7 }), 0, 0.02, 0.1)).rotation.x = Math.PI / 2;
  const bulbM = basic({ color: 0xffd090 });
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), bulbM)).position.set(0, 0.06, 0.19);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 }));
  glow.position.set(0, 0.06, 0.22); glow.scale.set(1.3, 1.3, 1); g.add(glow); sconceGlows.push(glow);
  // ciepła plama światła na ścianie
  const spill = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 2.2), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }));
  spill.position.set(0, -0.1, 0.01); g.add(spill);
}

// ---------- dym i snop światła lampy ----------
const smokes: { s: THREE.Sprite; vx: number; x0: number }[] = [];
for (let i = 0; i < 9; i++) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, opacity: 0.2 + R() * 0.15, depthWrite: false, color: 0xffe8d0 }));
  // dym tylko z tyłu i po bokach sali, nigdy przy kamerze (ta stoi z przodu, z > 2)
  const side = i % 3 === 2;
  s.position.set(side ? (i % 2 ? 4.6 : -4.6) : (R() - 0.5) * 8, 2.9 + R() * 1.2, side ? -1 + R() * 2.5 : -5 + R() * 3.5);
  s.scale.set(4 + R() * 3, 2 + R() * 1.5, 1);
  add(s); smokes.push({ s, vx: (R() - 0.5) * 0.12, x0: s.position.x });
}
const beam = new THREE.Mesh(
  new THREE.ConeGeometry(1.25, 1.65, 40, 1, true),
  new THREE.MeshBasicMaterial({ color: 0xffc070, transparent: true, opacity: 0.045, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
);
beam.position.y = 2.45 - 0.825; add(beam);

// ---------- animacja ----------
/** Wołane co klatkę. `camY` – wysokość kamery (wysoko = widok z góry, chowamy sufit). */
export function updateBar(t: number, dt: number, camY: number): void {
  upper.visible = camY < H - 0.4;
  for (const sm of smokes) sm.s.visible = upper.visible; // z góry dym zasłaniałby bar
  rainTex.offset.y = (rainTex.offset.y + dt * 0.9) % 1;
  for (const f of flames) {
    const k = 0.8 + Math.sin(t * 9 + f.seed) * 0.12 + Math.sin(t * 23 + f.seed * 3) * 0.08;
    f.m.opacity = 0.7 + k * 0.25;
    if (f.light) f.light.intensity = 0.5 * k;
  }
  for (const sm of smokes) {
    sm.s.position.x = sm.x0 + Math.sin(t * 0.05 + sm.vx * 40) * 0.8;
    sm.s.material.rotation = Math.sin(t * 0.03 + sm.x0) * 0.2;
  }
  const hue = (t * 0.05) % 1;
  jukeGlow.color.setHSL(hue, 0.6, 0.6);
  jukeLight.color.setHSL(hue, 0.8, 0.55);
  jukeLight.intensity = 0.5 + Math.sin(t * 2.2) * 0.15;
  shelfLight.intensity = 1.05 + Math.sin(t * 0.7) * 0.05;
  moon.intensity = 0.5 + (Math.sin(t * 0.37) > 0.997 ? 1.5 : 0); // czasem błyskawica
  sconceGlows.forEach((g, i) => { g.material.opacity = 0.72 + Math.sin(t * 7 + i * 2.1) * 0.04 + Math.sin(t * 19 + i) * 0.03; });
}
