// ---------- renderer ----------
const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07050a);
scene.fog = new THREE.FogExp2(0x0a0608, 0.075);
const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 60);

// ---------- tekstury z canvasu ----------
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
  t.userData = { c, draw }; return t;
}
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function star(g, cx, cy, R, r) { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r : R; g.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad); } g.closePath(); }

const woodTex = canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = '#4e2c14'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 160; i++) {
    const y = rnd() * h; g.strokeStyle = rnd() < 0.5 ? `rgba(20,8,2,${rnd() * 0.3})` : `rgba(130,75,35,${rnd() * 0.22})`;
    g.lineWidth = 1 + rnd() * 3; g.beginPath(); g.moveTo(0, y);
    for (let x = 0; x <= w; x += 24) g.lineTo(x, y + Math.sin(x * 0.015 + i) * 5);
    g.stroke();
  }
});
woodTex.wrapS = woodTex.wrapT = THREE.RepeatWrapping;
const floorTex = canvasTex(512, 512, (g, w, h) => {
  for (let r = 0; r < 8; r++) {
    const off = (r % 2) * 128;
    for (let k = -1; k < 3; k++) {
      const v = 30 + rnd() * 18; g.fillStyle = `rgb(${v + 22},${v + 8},${v - 6})`;
      g.fillRect(off + k * 256, r * 64, 256, 64);
      for (let i = 0; i < 14; i++) { g.strokeStyle = `rgba(0,0,0,${rnd() * 0.25})`; g.beginPath(); const y = r * 64 + rnd() * 64; g.moveTo(off + k * 256, y); g.lineTo(off + k * 256 + 256, y + (rnd() - 0.5) * 6); g.stroke(); }
      g.fillStyle = 'rgba(0,0,0,.7)'; g.fillRect(off + k * 256, r * 64, 3, 64);
    }
    g.fillStyle = 'rgba(0,0,0,.75)'; g.fillRect(0, r * 64, w, 3);
  }
});
floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set(5, 5);
const feltTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#123524'; g.fillRect(0, 0, w, h);
  const id = g.getImageData(0, 0, w, h); for (let i = 0; i < id.data.length; i += 4) { const n = (rnd() - 0.5) * 18; id.data[i] += n; id.data[i + 1] += n; id.data[i + 2] += n; } g.putImageData(id, 0, 0);
});
feltTex.wrapS = feltTex.wrapT = THREE.RepeatWrapping; feltTex.repeat.set(3, 3);
const wallTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#1d2a22'; g.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 32) { g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x, 0, 12, h); g.fillStyle = 'rgba(200,160,90,.06)'; g.fillRect(x + 14, 0, 2, h); }
});
wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping; wallTex.repeat.set(8, 2);

const CARD_COL = { K: '#8e1c1c', Q: '#1d3d8f', A: '#151515', J: '#6a1f8a', D: '#7a0d0d', M: '#2a5a7a', X: '#9a6208' };
function faceTex(type) {
  return canvasTex(256, 360, (g, w, h) => {
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
const backTex = canvasTex(256, 360, (g, w, h) => {
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

// ---------- pomocnicze ----------
function mat(c, o = {}) { return new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.75, metalness: 0.05 }, o)); }
function mesh(geo, m, x = 0, y = 0, z = 0) { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; return o; }

// ---------- sala ----------
const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), mat(0x8a7060, { map: floorTex, roughness: 0.9 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
const room = new THREE.Mesh(new THREE.BoxGeometry(12, 5, 12), mat(0x6a7a6a, { map: wallTex, side: THREE.BackSide, roughness: 0.95 }));
room.position.y = 2.5; scene.add(room);
// wainscot
const wains = new THREE.Mesh(new THREE.BoxGeometry(11.9, 1.1, 11.9), mat(0x3a2210, { map: woodTex, side: THREE.BackSide }));
wains.position.y = 0.55; scene.add(wains);

// półka z butelkami
const shelfZ = -5.6;
const woodM = mat(0x3a2210, { map: woodTex });
for (const y of [1.3, 1.85, 2.4]) scene.add(mesh(new THREE.BoxGeometry(4.6, 0.06, 0.35), woodM, 0, y, shelfZ));
scene.add(mesh(new THREE.BoxGeometry(5.0, 0.95, 0.7), woodM, 0, 0.475, shelfZ + 0.6)); // kontuar
const bottleCols = [0x2d5a2a, 0x6a3a10, 0x8a5a14, 0x1d3a4a, 0x5a1a1a, 0xa08a50];
for (const y of [1.33, 1.88, 2.43]) {
  for (let x = -2.1; x < 2.1; x += 0.18 + rnd() * 0.12) {
    if (rnd() < 0.15) continue;
    const h = 0.22 + rnd() * 0.14, r = 0.045 + rnd() * 0.025;
    const m = new THREE.MeshStandardMaterial({ color: bottleCols[(rnd() * bottleCols.length) | 0], roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.85, emissive: 0x110800 });
    const b = mesh(new THREE.CylinderGeometry(r, r, h, 10), m, x, y + h / 2, shelfZ + (rnd() - 0.5) * 0.1);
    const n = mesh(new THREE.CylinderGeometry(r * 0.35, r * 0.45, h * 0.45, 8), m, 0, h * 0.7, 0);
    b.add(n); scene.add(b);
  }
}
// neon
const signTex = canvasTex(1024, 220, (g, w, h) => {
  g.clearRect(0, 0, w, h); g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '96px Sancreek, Georgia, serif'; g.shadowColor = '#ff7a1a'; g.shadowBlur = 36;
  g.fillStyle = '#ffb060'; g.fillText('Bar pod Bębenkiem', w / 2, h / 2 + 6); g.shadowBlur = 12; g.fillText('Bar pod Bębenkiem', w / 2, h / 2 + 6);
  g.fillStyle = '#fff1d8'; g.shadowBlur = 0; g.globalAlpha = 0.5; g.fillText('Bar pod Bębenkiem', w / 2, h / 2 + 6);
});
const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.77), new THREE.MeshBasicMaterial({ map: signTex, transparent: true, toneMapped: false, depthWrite: false }));
sign.position.set(0, 3.25, shelfZ - 0.05); scene.add(sign);
if (document.fonts && document.fonts.load) document.fonts.load('96px Sancreek').then(() => { const u = signTex.userData; u.draw(u.c.getContext('2d'), u.c.width, u.c.height); signTex.needsUpdate = true; }).catch(() => {});
const signLight = new THREE.PointLight(0xff8a30, 1.2, 6, 2); signLight.position.set(0, 3.0, shelfZ + 0.6); scene.add(signLight);

// beczki po bokach
const barrelM = mat(0x4a2a12, { map: woodTex });
const hoopM = mat(0x222222, { metalness: 0.7, roughness: 0.4 });
for (const [x, z] of [[-4.6, -3.8], [4.5, -4.2], [-4.9, 2.5]]) {
  const b = mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.0, 18), barrelM, x, 0.5, z); scene.add(b);
  for (const y of [-0.32, 0.32]) b.add(mesh(new THREE.CylinderGeometry(0.462, 0.462, 0.06, 18), hoopM, 0, y, 0));
}

// stół
const tableY = 0.82;
const table = new THREE.Group(); scene.add(table);
table.add(mesh(new THREE.CylinderGeometry(1.3, 1.26, 0.08, 48), mat(0x5a3418, { map: woodTex, roughness: 0.55 }), 0, tableY - 0.04, 0));
const felt = mesh(new THREE.CylinderGeometry(1.14, 1.14, 0.012, 48), mat(0x1f5a3a, { map: feltTex, roughness: 0.95 }), 0, tableY + 0.002, 0); table.add(felt);
table.add(mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.74, 16), woodM, 0, 0.39, 0));
table.add(mesh(new THREE.CylinderGeometry(0.55, 0.6, 0.06, 24), woodM, 0, 0.03, 0));
const PILE_Y = tableY + 0.012;
const tableTop = new THREE.Group(); scene.add(tableTop);
[table.children[0], felt].forEach(m => { table.remove(m); tableTop.add(m); });

// lampa
const shadeM = new THREE.MeshStandardMaterial({ color: 0x1d3a26, metalness: 0.6, roughness: 0.4, side: THREE.DoubleSide });
const shade = mesh(new THREE.ConeGeometry(0.42, 0.32, 28, 1, true), shadeM, 0, 2.62, 0); scene.add(shade);
scene.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 2.4, 4), mat(0x111111), 0, 3.95, 0));
const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffe2a8, toneMapped: false })); bulb.position.set(0, 2.5, 0); scene.add(bulb);
const spot = new THREE.SpotLight(0xffb870, 2.6, 9, 0.82, 0.55, 1.2);
spot.position.set(0, 2.5, 0); spot.target.position.set(0, 0, 0); spot.castShadow = true;
spot.shadow.mapSize.set(1024, 1024); spot.shadow.bias = -0.0004; spot.shadow.camera.near = 0.3; spot.shadow.camera.far = 6;
scene.add(spot); scene.add(spot.target);
scene.add(new THREE.HemisphereLight(0x3a4a66, 0x120806, 0.38));
const fill = new THREE.PointLight(0xff9a50, 0.35, 8, 2); fill.position.set(0, 1.6, 2.6); scene.add(fill);

// kurz w świetle lampy
const dustN = 260, dustPos = new Float32Array(dustN * 3);
for (let i = 0; i < dustN; i++) { const a = rnd() * 6.28, r = Math.sqrt(rnd()) * 1.4; dustPos[i * 3] = Math.cos(a) * r; dustPos[i * 3 + 1] = 0.9 + rnd() * 1.6; dustPos[i * 3 + 2] = Math.sin(a) * r; }
const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xffd9a0, size: 0.014, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
scene.add(dust);

