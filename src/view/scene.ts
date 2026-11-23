import * as THREE from 'three';
import { feltTex, woodTex } from './textures';

// ---------- renderer ----------
export const canvas = document.querySelector<HTMLCanvasElement>('#c')!;
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07050a);
scene.fog = new THREE.FogExp2(0x0d0806, 0.06);
export const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 60);

// ---------- pomocnicze ----------
export function mat(c: number, o: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial { return new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.75, metalness: 0.05 }, o)); }
export function mesh(geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; return o; }

// Sala (ściany, kontuar, dekoracje) jest w bar.ts.
export const woodM = mat(0x3a2210, { map: woodTex });

// stół
export const tableY = 0.82;
const table = new THREE.Group(); scene.add(table);
table.add(mesh(new THREE.CylinderGeometry(1.3, 1.26, 0.08, 48), mat(0x5a3418, { map: woodTex, roughness: 0.55 }), 0, tableY - 0.04, 0));
const felt = mesh(new THREE.CylinderGeometry(1.14, 1.14, 0.012, 48), mat(0x1f5a3a, { map: feltTex, roughness: 0.95 }), 0, tableY + 0.002, 0); table.add(felt);
table.add(mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.74, 16), woodM, 0, 0.39, 0));
table.add(mesh(new THREE.CylinderGeometry(0.55, 0.6, 0.06, 24), woodM, 0, 0.03, 0));
export const PILE_Y = tableY + 0.012;
export const tableTop = new THREE.Group(); scene.add(tableTop);
[table.children[0], felt].forEach(m => { table.remove(m); tableTop.add(m); });

// lampa
const shadeM = new THREE.MeshStandardMaterial({ color: 0x1d3a26, metalness: 0.6, roughness: 0.4, side: THREE.DoubleSide });
export const shade = mesh(new THREE.ConeGeometry(0.42, 0.32, 28, 1, true), shadeM, 0, 2.62, 0); scene.add(shade);
export const cord = mesh(new THREE.CylinderGeometry(0.008, 0.008, 2.4, 4), mat(0x111111), 0, 3.95, 0); scene.add(cord);
export const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffe2a8, toneMapped: false })); bulb.position.set(0, 2.5, 0); scene.add(bulb);
export const spot = new THREE.SpotLight(0xffb870, 2.6, 9, 0.82, 0.55, 1.2);
spot.position.set(0, 2.5, 0); spot.target.position.set(0, 0, 0); spot.castShadow = true;
spot.shadow.mapSize.set(1024, 1024); spot.shadow.bias = -0.0004; spot.shadow.camera.near = 0.3; spot.shadow.camera.far = 6;
scene.add(spot); scene.add(spot.target);
scene.add(new THREE.HemisphereLight(0x4a5070, 0x1a0c06, 0.55));
const fill = new THREE.PointLight(0xff9a50, 0.35, 8, 2); fill.position.set(0, 1.6, 2.6); scene.add(fill);

// kurz w świetle lampy
export const dustN = 260, dustPos = new Float32Array(dustN * 3);
for (let i = 0; i < dustN; i++) { const a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * 1.4; dustPos[i * 3] = Math.cos(a) * r; dustPos[i * 3 + 1] = 0.9 + Math.random() * 1.6; dustPos[i * 3 + 2] = Math.sin(a) * r; }
export const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xffd9a0, size: 0.014, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
scene.add(dust);

