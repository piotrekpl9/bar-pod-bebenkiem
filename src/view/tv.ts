// Telewizor na ścianie z filmikami z YouTube.
//
// YouTube nie da się narysować jako tekstury WebGL (inna domena), więc prawdziwy odtwarzacz
// (iframe) stoi ZA płótnem 3D, ustawiony w przestrzeni przez CSS3DRenderer dokładnie tam,
// gdzie ekran telewizora. Ekran w WebGL jest „dziurą” (piksele przezroczyste), przez którą
// widać iframe. Dzięki temu postacie i dym normalnie zasłaniają telewizor.

import * as THREE from 'three';
import { CSS3DObject, CSS3DRenderer } from 'three/examples/jsm/renderers/CSS3DRenderer.js';
import { embedUrl } from '../core/youtube';
import { camera, mat, mesh, scene } from './scene';

/** YouTube nie odtwarza osadzonych filmów ze strony otwartej z pliku (brak adresu strony). */
export const TV_SUPPORTED = /^https?:$/.test(location.protocol);

const SCREEN_W = 1.12, SCREEN_H = 0.63; // 16:9, w metrach
const PX_W = 640, PX_H = 360; // rozmiar iframe w pikselach

// ---------- model ----------
const tv = new THREE.Group();
tv.position.set(3.5, 2.35, -6 + 0.2); // tylna ściana, obok półek, nad szafą grającą
scene.add(tv);
tv.add(mesh(new THREE.BoxGeometry(1.3, 0.8, 0.12), mat(0x151515, { roughness: 0.45, metalness: 0.2 })));
tv.add(mesh(new THREE.BoxGeometry(0.24, 0.3, 0.14), mat(0x2a2a2a, { metalness: 0.7, roughness: 0.4 }), 0, 0, -0.12)); // uchwyt
const led = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2020, toneMapped: false }));
led.position.set(0.55, -0.35, 0.062); tv.add(led);
const darkScreen = new THREE.Mesh(
  new THREE.PlaneGeometry(SCREEN_W, SCREEN_H),
  new THREE.MeshStandardMaterial({ color: 0x0a0d10, roughness: 0.15, metalness: 0.4, emissive: 0x04070a }),
);
darkScreen.position.z = 0.061; tv.add(darkScreen);
/** Dziura w obrazie WebGL: zapisuje przezroczyste piksele, przez które widać iframe. */
const hole = new THREE.Mesh(
  new THREE.PlaneGeometry(SCREEN_W, SCREEN_H),
  new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0, blending: THREE.NoBlending, fog: false, toneMapped: false }),
);
hole.position.z = 0.062; hole.visible = false; tv.add(hole);
tv.traverse(o => { o.castShadow = false; });

// ---------- warstwa z odtwarzaczem ----------
const css = new CSS3DRenderer();
document.getElementById('tvLayer')!.appendChild(css.domElement);
const cssScene = new THREE.Scene();
let iframe: HTMLIFrameElement | null = null;
let player: CSS3DObject | null = null;
let soundOn = false;
let onError: (code: number) => void = () => {};
/** Wywoływane, gdy odtwarzacz YouTube zgłosi błąd (np. film zablokowany do osadzania). */
export function onTvError(fn: (code: number) => void): void { onError = fn; }
window.addEventListener('message', e => {
  if (!iframe || e.source !== iframe.contentWindow) return;
  try {
    const d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
    if (d?.event === 'onError' && typeof d.info === 'number') onError(d.info);
  } catch { /* inne wiadomości nas nie interesują */ }
});

function post(func: string, args: unknown[] = []): void {
  iframe?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
}
function applySound(): void {
  if (soundOn) { post('unMute'); post('setVolume', [70]); } else post('mute');
}

/** Włącza filmik (id) od podanej sekundy albo wyłącza telewizor (null). */
export function setTvVideo(id: string | null, startSec = 0): void {
  if (player) { cssScene.remove(player); player.element.remove(); player = null; iframe = null; }
  // z pliku YouTube i tak pokaże tylko błąd, więc ekran zostaje ciemny, a dioda pomarańczowa
  const show = !!id && TV_SUPPORTED;
  hole.visible = show; darkScreen.visible = !show;
  (led.material as THREE.MeshBasicMaterial).color.set(!id ? 0xff2020 : show ? 0x20ff40 : 0xff9020);
  if (!show) return;
  const box = document.createElement('div');
  box.style.cssText = `width:${PX_W}px;height:${PX_H}px;background:#000;`;
  iframe = document.createElement('iframe');
  iframe.width = String(PX_W); iframe.height = String(PX_H);
  iframe.style.border = '0';
  iframe.allow = 'autoplay; encrypted-media; picture-in-picture';
  iframe.referrerPolicy = 'strict-origin-when-cross-origin';
  iframe.src = embedUrl(id, startSec, TV_SUPPORTED ? location.origin : undefined);
  iframe.addEventListener('load', () => {
    // „podanie ręki” z odtwarzaczem, potem ustawienie dźwięku
    iframe?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*');
    setTimeout(applySound, 600); setTimeout(applySound, 2000);
  });
  box.appendChild(iframe);
  player = new CSS3DObject(box);
  tv.updateMatrixWorld();
  player.position.copy(hole.getWorldPosition(new THREE.Vector3()));
  player.quaternion.copy(hole.getWorldQuaternion(new THREE.Quaternion()));
  player.scale.setScalar(SCREEN_W / PX_W);
  cssScene.add(player);
}

/** Dźwięk telewizora (lokalnie, u każdego osobno). Zwraca nowy stan. */
export function toggleTvSound(): boolean { soundOn = !soundOn; applySound(); return soundOn; }
export const tvPlaying = (): boolean => !!player;

export function layoutTv(w: number, h: number): void { css.setSize(w, h); }
export function renderTv(): void { if (player) css.render(cssScene, camera); }
