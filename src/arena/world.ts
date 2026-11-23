// Świat areny: tekstury z canvasu, pudełka mapy, niebo, słońce i dekoracje.

import * as THREE from 'three';
import { canvasTex } from '../view/textures';
import { seededRng } from '../core/rng';
import { AWNINGS, BOUNDS, MAP, WALL_H, type Box, type Mat } from './map';

type Ctx = CanvasRenderingContext2D;
const R = seededRng(1234);

function speckle(g: Ctx, w: number, h: number, n: number, cols: string[], size: [number, number]): void {
  for (let i = 0; i < n; i++) {
    g.fillStyle = cols[(R() * cols.length) | 0];
    const s = size[0] + R() * (size[1] - size[0]);
    g.globalAlpha = 0.15 + R() * 0.35;
    g.fillRect(R() * w, R() * h, s, s);
  }
  g.globalAlpha = 1;
}

const tiled = (t: THREE.Texture) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };

// ---------- tekstury ----------
const sandTex = tiled(canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = '#c9a46c'; g.fillRect(0, 0, w, h);
  speckle(g, w, h, 5000, ['#b48d58', '#d8b77f', '#a98250', '#e2c693'], [1, 3]);
  for (let i = 0; i < 40; i++) { // zmarszczki piasku
    g.strokeStyle = `rgba(120,85,45,${0.05 + R() * 0.08})`; g.lineWidth = 2 + R() * 3;
    g.beginPath(); const y = R() * h; g.moveTo(0, y);
    for (let x = 0; x <= w; x += 32) g.lineTo(x, y + Math.sin(x * 0.02 + i) * 8);
    g.stroke();
  }
}));

const plasterTex = tiled(canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = '#d8bf93'; g.fillRect(0, 0, w, h);
  speckle(g, w, h, 3500, ['#c9ab7c', '#e6d1aa', '#b9996a'], [1, 4]);
  for (let i = 0; i < 18; i++) { // przetarcia i plamy
    const x = R() * w, y = R() * h, r = 20 + R() * 70;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(150,115,70,${0.05 + R() * 0.08})`); gr.addColorStop(1, 'rgba(150,115,70,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 6; i++) { // pęknięcia
    g.strokeStyle = 'rgba(90,65,35,.35)'; g.lineWidth = 1;
    g.beginPath(); let x = R() * w, y = R() * h; g.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += (R() - 0.5) * 40; y += R() * 30; g.lineTo(x, y); }
    g.stroke();
  }
}));

const stoneTex = tiled(canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = '#9d8360'; g.fillRect(0, 0, w, h);
  const rows = 8, rh = h / rows;
  for (let r = 0; r < rows; r++) {
    const off = (r % 2) * 64;
    for (let x = -off; x < w; x += 128) {
      const v = 135 + R() * 40;
      g.fillStyle = `rgb(${v + 20},${v},${v - 30})`;
      g.fillRect(x + 3, r * rh + 3, 122, rh - 6);
    }
  }
  speckle(g, w, h, 2500, ['#7d6646', '#bba27c'], [1, 3]);
}));

function crateDraw(g: Ctx, w: number, h: number): void {
  g.fillStyle = '#9a6a35'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 6; i++) { // deski
    const y = (i * h) / 6;
    g.fillStyle = i % 2 ? '#8d5f2e' : '#a37240'; g.fillRect(0, y, w, h / 6);
    g.fillStyle = 'rgba(40,20,5,.5)'; g.fillRect(0, y, w, 3);
  }
  speckle(g, w, h, 900, ['#6b4520', '#b58550'], [1, 3]);
  g.strokeStyle = '#5c3a17'; g.lineWidth = 34; g.strokeRect(17, 17, w - 34, h - 34); // rama
  g.lineWidth = 30; g.beginPath(); g.moveTo(30, 30); g.lineTo(w - 30, h - 30); g.stroke(); // ukośnik
  g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 3; g.strokeRect(34, 34, w - 68, h - 68);
  for (const [x, y] of [[17, 17], [w - 17, 17], [17, h - 17], [w - 17, h - 17]]) { g.fillStyle = '#333'; g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); }
}
const crateTex = canvasTex(256, 256, crateDraw);

const barrelTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#3f6a4a'; g.fillRect(0, 0, w, h);
  speckle(g, w, h, 800, ['#2d4f36', '#5b8a65', '#7a5a35'], [1, 4]);
  g.fillStyle = '#2a2a2a'; g.fillRect(0, 30, w, 14); g.fillRect(0, h - 44, w, 14);
  g.fillStyle = 'rgba(120,70,30,.5)'; g.fillRect(0, h * 0.45, w, 10); // rdza
});

const woodPlanks = (base: string) => tiled(canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 32) { g.fillStyle = `rgba(0,0,0,${0.08 + R() * 0.15})`; g.fillRect(x, 0, 32, h); g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(x, 0, 2, h); }
  speckle(g, w, h, 600, ['#000', '#fff'], [1, 2]);
}));
const roofTex = woodPlanks('#7a5530');
const doorTex = woodPlanks('#3d5f78');

const skyTex = canvasTex(16, 512, (g, _w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, '#2e6fb8'); gr.addColorStop(0.42, '#7fb2e0'); gr.addColorStop(0.5, '#f0d7a6'); gr.addColorStop(1, '#c9a46c');
  g.fillStyle = gr; g.fillRect(0, 0, 16, h);
});

// ---------- materiały ----------
const std = (map: THREE.Texture, o: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ map, roughness: 0.92, metalness: 0, ...o });
const MATS: Record<Mat, THREE.MeshStandardMaterial> = {
  wall: std(plasterTex),
  stone: std(stoneTex),
  crate: std(crateTex, { roughness: 0.8 }),
  barrel: std(barrelTex, { roughness: 0.6, metalness: 0.3 }),
  roof: std(roofTex),
  door: std(doorTex, { roughness: 0.8 }),
};
/** Rozmiar kafla tekstury w metrach; 0 = jedna tekstura na ścianę (skrzynie, beczki). */
const TILE: Record<Mat, number> = { wall: 3, stone: 2.5, crate: 0, barrel: 0, roof: 2, door: 1.5 };

/** Pudełko z UV w metrach – tekstura nie rozciąga się na długich murach. */
function boxGeo(b: Box): THREE.BoxGeometry {
  const w = b.x1 - b.x0, h = b.y1 - b.y0, d = b.z1 - b.z0;
  const geo = new THREE.BoxGeometry(w, h, d);
  const tile = TILE[b.m];
  if (!tile) return geo;
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const faces: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    const [fw, fh] = faces[f];
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, (uv.getX(i) * fw) / tile + (b.x0 + b.z0) * 0.13, (uv.getY(i) * fh) / tile + b.y0 / tile);
    }
  }
  uv.needsUpdate = true;
  return geo;
}

export interface World {
  scene: THREE.Scene;
  sun: THREE.DirectionalLight;
}

export function buildWorld(): World {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9cc4ea);
  scene.fog = new THREE.Fog(0xe8d3a8, 45, 140);

  // niebo
  const sky = new THREE.Mesh(new THREE.SphereGeometry(160, 24, 16), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false }));
  scene.add(sky);
  const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: canvasTex(128, 128, (g, w) => {
      const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      gr.addColorStop(0, 'rgba(255,250,230,1)'); gr.addColorStop(0.12, 'rgba(255,240,200,.9)'); gr.addColorStop(1, 'rgba(255,220,150,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, w);
    }), fog: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending,
  }));
  sunGlow.position.set(-70, 95, 40); sunGlow.scale.set(40, 40, 1); scene.add(sunGlow);

  // światło
  scene.add(new THREE.HemisphereLight(0xcfe3ff, 0xb88a55, 0.6));
  const sun = new THREE.DirectionalLight(0xfff0d2, 1.75);
  sun.position.set(-28, 45, 18); sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera as THREE.OrthographicCamera;
  sc.left = -34; sc.right = 34; sc.top = 26; sc.bottom = -26; sc.near = 5; sc.far = 110;
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  // ziemia
  const gw = BOUNDS.x * 2 + 80, gd = BOUNDS.z * 2 + 80;
  const groundGeo = new THREE.PlaneGeometry(gw, gd);
  const guv = groundGeo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < guv.count; i++) guv.setXY(i, (guv.getX(i) * gw) / 4, (guv.getY(i) * gd) / 4);
  const ground = new THREE.Mesh(groundGeo, std(sandTex, { roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

  // pudełka mapy
  for (const b of MAP) {
    let m: THREE.Mesh;
    if (b.m === 'barrel') {
      const r = Math.min(b.x1 - b.x0, b.z1 - b.z0) / 2;
      m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, b.y1 - b.y0, 16), MATS.barrel);
    } else m = new THREE.Mesh(boxGeo(b), MATS[b.m]);
    m.position.set((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2);
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
    // gzyms na wysokich murach
    if (b.m === 'wall' && b.y1 >= 3.9 && b.y0 === 0) {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(b.x1 - b.x0 + 0.16, 0.14, b.z1 - b.z0 + 0.16), MATS.stone);
      cap.position.set(m.position.x, b.y1 + 0.07, m.position.z); cap.castShadow = true; scene.add(cap);
    }
  }

  // markizy
  for (const a of AWNINGS) {
    const cloth = canvasTex(64, 64, (g, w, h) => { for (let x = 0; x < w; x += 16) { g.fillStyle = (x / 16) % 2 ? '#eee2c8' : `#${a.c.toString(16).padStart(6, '0')}`; g.fillRect(x, 0, 16, h); } });
    const g = new THREE.Group(); g.position.set(a.x, a.y, a.z); g.rotation.y = a.ry; scene.add(g);
    const tilt = 0.38;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(a.w, a.d), new THREE.MeshStandardMaterial({ map: cloth, side: THREE.DoubleSide, roughness: 1 }));
    m.rotation.x = -Math.PI / 2 + tilt;
    m.position.set(0, -Math.sin(tilt) * a.d / 2, Math.cos(tilt) * a.d / 2 + 0.02);
    m.castShadow = true; g.add(m);
  }

  // panorama miasta za murami
  const far = std(plasterTex, { color: 0xe9d6b4 });
  for (let i = 0; i < 46; i++) {
    const ang = (i / 46) * Math.PI * 2 + R() * 0.05;
    const rx = Math.cos(ang), rz = Math.sin(ang);
    const dist = 1 / Math.max(Math.abs(rx) / (BOUNDS.x + 6), Math.abs(rz) / (BOUNDS.z + 6)) + R() * 10;
    const w = 5 + R() * 8, h = WALL_H + 1 + R() * 9;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 5 + R() * 6), far);
    m.position.set(rx * dist, h / 2, rz * dist); m.rotation.y = R() * 0.4;
    scene.add(m);
    if (R() < 0.25) { // kopuła albo minaret
      const dome = new THREE.Mesh(new THREE.SphereGeometry(w * 0.32, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), MATS.stone);
      dome.position.set(m.position.x, h, m.position.z); scene.add(dome);
    }
  }
  return { scene, sun };
}
