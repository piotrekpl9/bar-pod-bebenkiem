// Modele na arenie: przeciwnik (żołnierz z klocków) i broń w rękach gracza.

import * as THREE from 'three';
import type { Side } from './match';
import { HEAD } from './ray';
import type { WeaponId } from './weapons';

const m = (c: number, o: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, ...o });
function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  b.position.set(x, y, z); b.castShadow = true;
  return b;
}

const TEAM = [
  { jacket: 0x8a6a42, pants: 0x5a4a33, accent: 0x9a2a22 }, // pustynni: chusta
  { jacket: 0x34496a, pants: 0x2a3344, accent: 0x3d4a35 }, // niebiescy: hełm
];
const skin = m(0xd9a77c), boot = m(0x2a2018), gunM = m(0x1d1d1f, { metalness: 0.6, roughness: 0.45 }), woodM = m(0x6b4423, { roughness: 0.7 });

/** Karabin z klocków (wspólny dla przeciwnika i widoku z pierwszej osoby). */
function rifleMesh(scale = 1): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.06, 0.09, 0.44, gunM, 0, 0, -0.06)); // komora
  g.add(box(0.07, 0.07, 0.22, woodM, 0, -0.005, -0.36)); // łoże
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 8), gunM); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.015, -0.6); g.add(barrel);
  g.add(box(0.05, 0.1, 0.26, woodM, 0, -0.03, 0.27)); // kolba
  const mag = box(0.04, 0.17, 0.07, gunM, 0, -0.12, -0.12); mag.rotation.x = 0.3; g.add(mag);
  const grip = box(0.04, 0.1, 0.05, gunM, 0, -0.09, 0.08); grip.rotation.x = -0.3; g.add(grip);
  g.add(box(0.015, 0.04, 0.02, gunM, 0, 0.06, -0.48)); // muszka
  g.scale.setScalar(scale);
  return g;
}

function pistolMesh(scale = 1): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.035, 0.045, 0.2, gunM, 0, 0.02, -0.05)); // zamek
  const grip = box(0.032, 0.11, 0.05, m(0x2b2622), 0, -0.05, 0.02); grip.rotation.x = 0.2; g.add(grip);
  g.add(box(0.01, 0.015, 0.01, gunM, 0, 0.05, -0.14));
  g.scale.setScalar(scale);
  return g;
}

// ---------- przeciwnik ----------
export interface Soldier {
  root: THREE.Group;
  hips: THREE.Group;
  upper: THREE.Group;
  head: THREE.Group;
  legL: THREE.Group; legR: THREE.Group;
  guns: Record<WeaponId, THREE.Group>;
  phase: number;
  dead: number;
}

export function makeSoldier(side: Side): Soldier {
  const T = TEAM[side];
  const jacket = m(T.jacket), pants = m(T.pants), accent = m(T.accent);
  const root = new THREE.Group();
  const hips = new THREE.Group(); hips.position.y = 0.92; root.add(hips);
  const leg = (x: number) => {
    const g = new THREE.Group(); g.position.set(x, 0, 0); hips.add(g);
    g.add(box(0.17, 0.8, 0.2, pants, 0, -0.4, 0));
    g.add(box(0.19, 0.12, 0.28, boot, 0, -0.86, -0.04));
    return g;
  };
  const legL = leg(-0.11), legR = leg(0.11);
  const upper = new THREE.Group(); hips.add(upper);
  upper.add(box(0.46, 0.54, 0.28, jacket, 0, 0.27, 0)); // tułów
  upper.add(box(0.48, 0.12, 0.3, accent, 0, 0.02, 0)); // pas
  // środek głowy wypada dokładnie w strefie trafienia (ray.ts: headCenter)
  const head = new THREE.Group(); head.position.y = 0.52; upper.add(head);
  const hs = HEAD * 2;
  head.add(box(hs * 0.9, hs, hs * 0.9, skin, 0, hs / 2, 0));
  // oczy
  for (const x of [-0.05, 0.05]) head.add(box(0.035, 0.03, 0.01, m(0x111111), x, hs * 0.58, -hs * 0.45));
  if (side === 0) { head.add(box(hs * 0.96, 0.1, hs * 0.96, accent, 0, hs * 0.82, 0)); head.add(box(hs * 0.92, 0.12, hs * 0.5, accent, 0, hs * 0.2, -hs * 0.25)); }
  else { const helmet = new THREE.Mesh(new THREE.SphereGeometry(hs * 0.62, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), accent); helmet.position.y = hs * 0.75; helmet.castShadow = true; head.add(helmet); }
  // ręce trzymające broń przed sobą
  const arm = (x: number, z: number, rx: number) => { const a = box(0.12, 0.12, 0.5, jacket, x, 0.4, z); a.rotation.x = rx; upper.add(a); };
  arm(-0.24, -0.2, -0.15); arm(0.2, -0.22, 0.05);
  const guns = { rifle: rifleMesh(1), pistol: pistolMesh(1.3) };
  guns.rifle.position.set(0.05, 0.37, -0.5); guns.pistol.position.set(0.02, 0.38, -0.5);
  upper.add(guns.rifle, guns.pistol);
  return { root, hips, upper, head, legL, legR, guns, phase: 0, dead: 0 };
}

/** Ustawia pozę przeciwnika. `dt` w sekundach. */
export function poseSoldier(s: Soldier, f: { x: number; y: number; z: number; yaw: number; pitch: number; crouch: boolean; speed: number; weapon: WeaponId; alive: boolean }, dt: number): void {
  s.root.position.set(f.x, f.y, f.z);
  s.root.rotation.y = f.yaw;
  s.guns.rifle.visible = f.weapon === 'rifle'; s.guns.pistol.visible = f.weapon === 'pistol';
  if (!f.alive) {
    s.dead = Math.min(1, s.dead + dt * 3);
    s.root.rotation.x = 0; s.hips.rotation.x = -s.dead * 1.45; s.hips.position.y = 0.92 - s.dead * 0.72;
    return;
  }
  s.dead = 0; s.hips.rotation.x = 0;
  const run = Math.min(1, f.speed / 5);
  s.phase += dt * (4 + f.speed * 1.6);
  const swing = Math.sin(s.phase) * 0.7 * run;
  const crouch = f.crouch ? 1 : 0;
  s.hips.position.y = 0.92 - crouch * 0.55;
  // przy kucaniu nogi się „składają” (jeden klocek nie zegnie się w kolanie)
  s.legL.rotation.x = swing * (1 - crouch) - crouch * 0.5; s.legR.rotation.x = -swing * (1 - crouch) + crouch * 0.25;
  s.legL.scale.y = s.legR.scale.y = 1 - crouch * 0.55;
  s.upper.rotation.x = Math.max(-0.5, Math.min(0.5, f.pitch * 0.6)) + crouch * 0.15;
  s.head.rotation.x = Math.max(-0.6, Math.min(0.6, f.pitch * 0.4));
}

// ---------- widok z pierwszej osoby ----------
export interface ViewModel {
  scene: THREE.Scene;
  cam: THREE.PerspectiveCamera;
  root: THREE.Group;
  guns: Record<WeaponId, THREE.Group>;
  flash: THREE.Sprite;
  muzzle: Record<WeaponId, THREE.Vector3>;
}

export function makeViewModel(side: Side): ViewModel {
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(62, 1, 0.01, 5);
  scene.add(new THREE.HemisphereLight(0xdfeaff, 0x8a6a45, 0.55));
  const sun = new THREE.DirectionalLight(0xfff0d2, 0.75); sun.position.set(-1, 2, 1); scene.add(sun);
  const root = new THREE.Group(); scene.add(root);
  const sleeve = m(TEAM[side].jacket), glove = m(0x3a2f25);
  const rifle = new THREE.Group();
  const r = rifleMesh(1); rifle.add(r);
  rifle.add(box(0.1, 0.1, 0.4, sleeve, 0.06, -0.1, 0.32)); // prawe przedramię
  rifle.add(box(0.07, 0.08, 0.1, glove, 0.02, -0.07, 0.1));
  const left = box(0.1, 0.1, 0.45, sleeve, -0.1, -0.08, -0.2); left.rotation.y = -0.5; rifle.add(left);
  rifle.add(box(0.08, 0.07, 0.1, glove, -0.02, -0.05, -0.36));
  rifle.position.set(0.2, -0.21, -0.52); rifle.scale.setScalar(0.85);
  const pistol = new THREE.Group();
  pistol.add(pistolMesh(1.2));
  pistol.add(box(0.1, 0.1, 0.4, sleeve, 0.04, -0.12, 0.25));
  pistol.add(box(0.07, 0.09, 0.09, glove, 0, -0.07, 0.03));
  pistol.position.set(0.16, -0.19, -0.36);
  root.add(rifle, pistol);
  const flashTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!;
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,220,1)'); gr.addColorStop(0.3, 'rgba(255,200,80,.9)'); gr.addColorStop(1, 'rgba(255,120,0,0)');
    g.fillStyle = gr; g.beginPath();
    for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2, rr = i % 2 ? 12 : 32; g.lineTo(32 + Math.cos(a) * rr, 32 + Math.sin(a) * rr); }
    g.fill();
    return new THREE.CanvasTexture(c);
  })();
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  flash.scale.setScalar(0.16); flash.visible = false; scene.add(flash);
  return {
    scene, cam, root, guns: { rifle, pistol }, flash,
    muzzle: { rifle: new THREE.Vector3(0.2, -0.198, -1.18), pistol: new THREE.Vector3(0.16, -0.16, -0.62) },
  };
}
