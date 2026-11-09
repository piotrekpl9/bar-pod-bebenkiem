import * as THREE from 'three';
import type { Card } from '../core/types';

// ---------- tekstury z canvasu ----------
type Ctx = CanvasRenderingContext2D;
type Draw = (g: Ctx, w: number, h: number) => void;

/** Tekstura rysowana w canvasie. `redraw()` pozwala odświeżyć ją po załadowaniu fontu. */
export function canvasTex(w: number, h: number, draw: Draw): THREE.CanvasTexture & { redraw(): void } {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d')!; draw(g, w, h);
  const t = new THREE.CanvasTexture(c) as THREE.CanvasTexture & { redraw(): void };
  t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
  t.redraw = () => { g.clearRect(0, 0, w, h); draw(g, w, h); t.needsUpdate = true; };
  return t;
}
export function rr(g: Ctx, x: number, y: number, w: number, h: number, r: number): void { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function star(g: Ctx, cx: number, cy: number, R: number, r: number): void { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r : R; g.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad); } g.closePath(); }

export const woodTex = canvasTex(512, 512, (g: Ctx, w: number, h: number) => {
  g.fillStyle = '#4e2c14'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 160; i++) {
    const y = Math.random() * h; g.strokeStyle = Math.random() < 0.5 ? `rgba(20,8,2,${Math.random() * 0.3})` : `rgba(130,75,35,${Math.random() * 0.22})`;
    g.lineWidth = 1 + Math.random() * 3; g.beginPath(); g.moveTo(0, y);
    for (let x = 0; x <= w; x += 24) g.lineTo(x, y + Math.sin(x * 0.015 + i) * 5);
    g.stroke();
  }
});
woodTex.wrapS = woodTex.wrapT = THREE.RepeatWrapping;
export const floorTex = canvasTex(512, 512, (g: Ctx, w: number) => {
  for (let r = 0; r < 8; r++) {
    const off = (r % 2) * 128;
    for (let k = -1; k < 3; k++) {
      const v = 30 + Math.random() * 18; g.fillStyle = `rgb(${v + 22},${v + 8},${v - 6})`;
      g.fillRect(off + k * 256, r * 64, 256, 64);
      for (let i = 0; i < 14; i++) { g.strokeStyle = `rgba(0,0,0,${Math.random() * 0.25})`; g.beginPath(); const y = r * 64 + Math.random() * 64; g.moveTo(off + k * 256, y); g.lineTo(off + k * 256 + 256, y + (Math.random() - 0.5) * 6); g.stroke(); }
      g.fillStyle = 'rgba(0,0,0,.7)'; g.fillRect(off + k * 256, r * 64, 3, 64);
    }
    g.fillStyle = 'rgba(0,0,0,.75)'; g.fillRect(0, r * 64, w, 3);
  }
});
floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set(5, 5);
export const feltTex = canvasTex(256, 256, (g: Ctx, w: number, h: number) => {
  g.fillStyle = '#123524'; g.fillRect(0, 0, w, h);
  const id = g.getImageData(0, 0, w, h); for (let i = 0; i < id.data.length; i += 4) { const n = (Math.random() - 0.5) * 18; id.data[i] += n; id.data[i + 1] += n; id.data[i + 2] += n; } g.putImageData(id, 0, 0);
});
feltTex.wrapS = feltTex.wrapT = THREE.RepeatWrapping; feltTex.repeat.set(3, 3);
export const wallTex = canvasTex(256, 256, (g: Ctx, w: number, h: number) => {
  g.fillStyle = '#1d2a22'; g.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 32) { g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x, 0, 12, h); g.fillStyle = 'rgba(200,160,90,.06)'; g.fillRect(x + 14, 0, 2, h); }
});
wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping; wallTex.repeat.set(8, 2);

export const CARD_COL: Record<Card, string> = { K: '#8e1c1c', Q: '#1d3d8f', A: '#151515', J: '#6a1f8a', D: '#7a0d0d', M: '#2a5a7a', X: '#9a6208' };
export function faceTex(type: Card): THREE.CanvasTexture {
  return canvasTex(256, 360, (g: Ctx, w: number, h: number) => {
    g.fillStyle = '#efe3c8'; rr(g, 0, 0, w, h, 24); g.fill();
    g.strokeStyle = '#8a6a3a'; g.lineWidth = 7; rr(g, 14, 14, w - 28, h - 28, 16); g.stroke();
    g.fillStyle = CARD_COL[type]; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (type === 'D') { // Diabeł
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#3a0606'); gr.addColorStop(1, '#8a1010');
      g.fillStyle = gr; rr(g, 20, 20, w - 40, h - 40, 12); g.fill();
      g.fillStyle = '#ff5030'; const cx = w / 2, cy = h / 2 - 22;
      g.beginPath(); g.moveTo(cx - 60, cy - 20); g.lineTo(cx - 80, cy - 95); g.lineTo(cx - 25, cy - 50); g.fill();
      g.beginPath(); g.moveTo(cx + 60, cy - 20); g.lineTo(cx + 80, cy - 95); g.lineTo(cx + 25, cy - 50); g.fill();
      g.beginPath(); g.arc(cx, cy, 62, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ffe070'; g.beginPath(); g.moveTo(cx - 40, cy - 12); g.lineTo(cx - 12, cy - 2); g.lineTo(cx - 36, cy + 6); g.fill();
      g.beginPath(); g.moveTo(cx + 40, cy - 12); g.lineTo(cx + 12, cy - 2); g.lineTo(cx + 36, cy + 6); g.fill();
      g.strokeStyle = '#3a0606'; g.lineWidth = 6; g.beginPath(); g.arc(cx, cy + 14, 30, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
      g.fillStyle = '#ffd0b0'; g.font = 'bold 40px Georgia'; g.fillText('DIABEŁ', w / 2, h - 66);
    } else if (type === 'M') { // Lustro
      const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#dfe9ef'); gr.addColorStop(0.5, '#9fb6c4'); gr.addColorStop(1, '#e8f0f4');
      g.fillStyle = gr; rr(g, 20, 20, w - 40, h - 40, 12); g.fill();
      g.strokeStyle = '#2a5a7a'; g.lineWidth = 8; g.beginPath(); g.ellipse(w / 2, h / 2 - 22, 62, 88, 0, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 7;
      g.beginPath(); g.moveTo(w / 2 - 28, h / 2 - 60); g.lineTo(w / 2 - 6, h / 2 - 84); g.stroke();
      g.beginPath(); g.moveTo(w / 2 - 30, h / 2 - 30); g.lineTo(w / 2 + 14, h / 2 - 74); g.stroke();
      g.fillStyle = '#2a5a7a'; g.font = 'bold 40px Georgia'; g.fillText('LUSTRO', w / 2, h - 66);
    } else if (type === 'X') { // Podwójny strzał
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#f7e2a8'); gr.addColorStop(1, '#e0a840');
      g.fillStyle = gr; rr(g, 20, 20, w - 40, h - 40, 12); g.fill();
      g.fillStyle = '#5a2a00'; g.font = 'bold 120px Georgia'; g.fillText('×2', w / 2, h / 2 - 30);
      for (const dx of [-30, 30]) { g.fillStyle = '#b07a20'; rr(g, w / 2 + dx - 12, h / 2 + 34, 24, 34, 4); g.fill(); g.fillStyle = '#7a4a10'; g.beginPath(); g.arc(w / 2 + dx, h / 2 + 34, 12, Math.PI, 0); g.fill(); }
      g.fillStyle = '#5a2a00'; g.font = 'bold 30px Georgia'; g.fillText('PODWÓJNY', w / 2, h - 86); g.fillText('STRZAŁ', w / 2, h - 54);
    } else if (type === 'J') { star(g, w / 2, h / 2 - 20, 82, 34); g.fill(); g.font = 'bold 40px Georgia'; g.fillText('JOKER', w / 2, h - 68); }
    else {
      g.font = 'bold 180px Georgia'; g.fillText(type, w / 2, h / 2 + 10);
      g.font = 'bold 44px Georgia'; g.fillText(type, 50, 56);
      g.save(); g.translate(w - 50, h - 56); g.rotate(Math.PI); g.fillText(type, 0, 0); g.restore();
    }
  });
}
export const backTex = canvasTex(256, 360, (g: Ctx, w: number, h: number) => {
  g.fillStyle = '#efe3c8'; rr(g, 0, 0, w, h, 24); g.fill();
  g.fillStyle = '#5c1414'; rr(g, 12, 12, w - 24, h - 24, 16); g.fill();
  g.save(); rr(g, 12, 12, w - 24, h - 24, 16); g.clip();
  g.strokeStyle = 'rgba(230,180,90,.28)'; g.lineWidth = 2;
  for (let i = -h; i < w + h; i += 22) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke(); g.beginPath(); g.moveTo(i, h); g.lineTo(i + h, 0); g.stroke(); }
  g.restore();
  g.strokeStyle = '#d9a536'; g.lineWidth = 4; rr(g, 24, 24, w - 48, h - 48, 10); g.stroke();
  g.fillStyle = '#3a0c0c'; g.beginPath(); g.arc(w / 2, h / 2, 54, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#d9a536'; g.lineWidth = 4; g.stroke();
  g.fillStyle = '#d9a536';
  for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; g.beginPath(); g.arc(w / 2 + Math.cos(a) * 30, h / 2 + Math.sin(a) * 30, 10, 0, Math.PI * 2); g.fill(); }
});

