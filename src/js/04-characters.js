// ---------- postacie ----------
// miejsca przy stole: k = pozycja w widoku gracza (0 = ty, na dole), dalej zgodnie z ruchem wskazówek
let TABLE_N = 4, SEAT_R = 1.85;
function seatPos(k) { const a = 2 * Math.PI * k / TABLE_N; return new V3(-SEAT_R * Math.sin(a), 0, SEAT_R * Math.cos(a)); }

function makeChair() {
  const g = new THREE.Group(); const w = mat(0x3a2210, { map: woodTex });
  g.add(mesh(new THREE.BoxGeometry(0.55, 0.06, 0.5), w, 0, 0.48, -0.05));
  g.add(mesh(new THREE.BoxGeometry(0.55, 0.78, 0.06), w, 0, 0.9, -0.31));
  for (const [x, z] of [[-0.24, -0.27], [0.24, -0.27], [-0.24, 0.17], [0.24, 0.17]]) g.add(mesh(new THREE.BoxGeometry(0.05, 0.48, 0.05), w, x, 0.24, z));
  return g;
}
const fanGeo = new THREE.PlaneGeometry(0.13, 0.19); fanGeo.translate(0, 0.095, 0);
const fanMat = new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.6, side: THREE.DoubleSide });

function makeCharacter(kind) {
  const root = new THREE.Group(); root.add(makeChair());
  const upper = new THREE.Group(); upper.position.y = 0.55; root.add(upper);
  const P = { robot: 0x45535f, owl: 0x5a3b5e, mustache: 0x6e1c1c, frog: 0x3d4a2c, bear: 0x2f3b4a, cat: 0x4a2a3a, rabbit: 0x5a6a3a, penguin: 0x15161c }[kind];
  const bodyM = mat(P, kind === 'robot' ? { roughness: 0.4, metalness: 0.6 } : {});
  upper.add(mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.6, 20), bodyM, 0, 0.3, 0));
  upper.add(mesh(new THREE.SphereGeometry(0.205, 20, 12), bodyM, 0, 0.6, 0));
  const handM = kind === 'rabbit' ? mat(0xd8d2c8) : kind === 'penguin' ? mat(0x15161c) : kind === 'bear' ? mat(0x6b4426, { roughness: 0.9 }) : kind === 'cat' ? mat(0x8a8f99) : kind === 'frog' ? mat(0x5f9a3c) : kind === 'robot' ? mat(0x8a99a8, { metalness: 0.7, roughness: 0.35 }) : kind === 'owl' ? mat(0xd9a030) : mat(0xe2b48c);
  if (kind === 'mustache') { // kamizelka i koszula
    upper.add(mesh(new THREE.CylinderGeometry(0.09, 0.14, 0.45, 12, 1, true, -0.6, 1.2), mat(0xe8e0d0, { side: THREE.DoubleSide }), 0, 0.38, 0.13));
  }
  const arms = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(s * 0.25, 0.52, 0.02); arm.rotation.set(-1.15, 0, -s * 0.22);
    arm.add(mesh(new THREE.CylinderGeometry(0.06, 0.055, 0.5, 10), bodyM, 0, -0.25, 0));
    arm.add(mesh(new THREE.SphereGeometry(0.065, 12, 10), handM, 0, -0.52, 0));
    upper.add(arm); arms.push(arm);
  }
  const head = new THREE.Group(); head.position.y = 0.78; upper.add(head);
  const glow = [], lids = [];
  if (kind === 'robot') {
    const hm = mat(0x8a99a8, { metalness: 0.7, roughness: 0.35 });
    head.add(mesh(new THREE.BoxGeometry(0.36, 0.3, 0.32), hm, 0, 0.15, 0));
    const visor = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x33e0ff, emissiveIntensity: 1.8 });
    head.add(mesh(new THREE.BoxGeometry(0.28, 0.07, 0.02), visor, 0, 0.19, 0.165)); glow.push(visor);
    head.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.18, 6), hm, 0.1, 0.38, 0));
    const bulbM = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff3020, emissiveIntensity: 1.6 });
    head.add(mesh(new THREE.SphereGeometry(0.03, 10, 8), bulbM, 0.1, 0.48, 0)); glow.push(bulbM);
    const dk = mat(0x1a1a1a);
    for (let i = 0; i < 4; i++) head.add(mesh(new THREE.BoxGeometry(0.03, 0.05, 0.012), dk, -0.075 + i * 0.05, 0.07, 0.162));
    for (const s of [-1, 1]) { const e = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 14), hm, s * 0.2, 0.15, 0); e.rotation.z = Math.PI / 2; head.add(e); }
  } else if (kind === 'owl') {
    const fm = mat(0x8a5a30);
    head.add(mesh(new THREE.SphereGeometry(0.23, 24, 16), fm, 0, 0.2, 0));
    const face = mesh(new THREE.SphereGeometry(0.19, 24, 16), mat(0xd6b07e), 0, 0.18, 0.06); face.scale.set(1, 0.95, 0.85); head.add(face);
    for (const s of [-1, 1]) {
      const wht = mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.03, 20), mat(0xfff6e0, { roughness: 0.4 }), s * 0.085, 0.23, 0.215); wht.rotation.x = Math.PI / 2; head.add(wht);
      const irisM = new THREE.MeshStandardMaterial({ color: 0x442200, emissive: 0xffa020, emissiveIntensity: 1.3 });
      const iris = mesh(new THREE.CylinderGeometry(0.046, 0.046, 0.034, 18), irisM, s * 0.085, 0.23, 0.22); iris.rotation.x = Math.PI / 2; head.add(iris); glow.push(irisM);
      const pup = mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.036, 14), mat(0x050505, { roughness: 0.2 }), s * 0.085, 0.23, 0.223); pup.rotation.x = Math.PI / 2; head.add(pup);
      const lid = mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.036, 20, 1, false, 0, Math.PI), fm, s * 0.085, 0.23, 0.228); lid.rotation.set(Math.PI / 2, 0, 0); lid.scale.set(1, 1, 0.01); head.add(lid); lids.push(lid);
      const tuft = mesh(new THREE.ConeGeometry(0.05, 0.15, 6), fm, s * 0.15, 0.43, 0); tuft.rotation.z = -s * 0.45; head.add(tuft);
    }
    const beak = mesh(new THREE.ConeGeometry(0.035, 0.09, 8), mat(0xe0a020, { roughness: 0.4 }), 0, 0.14, 0.23); beak.rotation.x = Math.PI / 2 + 0.35; head.add(beak);
  } else if (kind === 'rabbit') {
    const fur = mat(0xd8d2c8, { roughness: 0.9 }), pink = mat(0xe8a0a8);
    const hd = mesh(new THREE.SphereGeometry(0.19, 24, 16), fur, 0, 0.17, 0); hd.scale.set(1, 1.05, 1); head.add(hd);
    for (const s of [-1, 1]) {
      const ear = mesh(new THREE.CylinderGeometry(0.045, 0.035, 0.32, 10), fur, s * 0.07, 0.5, -0.02); ear.scale.set(1, 1, 0.5); ear.rotation.z = -s * 0.18; head.add(ear);
      const inner = mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.26, 8), pink, s * 0.07, 0.5, 0.0); inner.scale.set(1, 1, 0.4); inner.rotation.z = -s * 0.18; head.add(inner);
      const eyeM = new THREE.MeshStandardMaterial({ color: 0x220a0a, emissive: 0xff3050, emissiveIntensity: 0.6, roughness: 0.2 });
      const eye = mesh(new THREE.SphereGeometry(0.028, 10, 8), eyeM, s * 0.075, 0.21, 0.16); eye.userData.eye = true; head.add(eye); lids.push(eye); glow.push(eyeM);
    }
    head.add(mesh(new THREE.SphereGeometry(0.025, 10, 8), pink, 0, 0.15, 0.19));
    head.add(mesh(new THREE.BoxGeometry(0.05, 0.04, 0.01), mat(0xffffff, { roughness: 0.3 }), 0, 0.09, 0.185));
    for (const s of [-1, 1]) { const bw = mesh(new THREE.ConeGeometry(0.035, 0.07, 8), mat(0x2a6a9a), s * 0.035, 0.66, 0.19); bw.rotation.z = s * Math.PI / 2; upper.add(bw); }
  } else if (kind === 'penguin') {
    const blk = mat(0x15161c, { roughness: 0.5 }), wht = mat(0xf2f0ea, { roughness: 0.6 });
    head.add(mesh(new THREE.SphereGeometry(0.2, 24, 16), blk, 0, 0.17, 0));
    const face = mesh(new THREE.SphereGeometry(0.17, 24, 16), wht, 0, 0.15, 0.06); face.scale.set(1, 0.9, 0.8); head.add(face);
    const belly = mesh(new THREE.SphereGeometry(0.17, 20, 14), wht, 0, 0.32, 0.12); belly.scale.set(1, 1.4, 0.6); upper.add(belly);
    for (const s of [-1, 1]) {
      const eyeM = new THREE.MeshStandardMaterial({ color: 0x050505, emissive: 0x3088ff, emissiveIntensity: 0.4, roughness: 0.2 });
      const eye = mesh(new THREE.SphereGeometry(0.026, 10, 8), eyeM, s * 0.07, 0.22, 0.175); eye.userData.eye = true; head.add(eye); lids.push(eye); glow.push(eyeM);
    }
    const beak = mesh(new THREE.ConeGeometry(0.045, 0.12, 10), mat(0xf0a020, { roughness: 0.4 }), 0, 0.15, 0.23); beak.rotation.x = Math.PI / 2; head.add(beak);
    const topHat = mat(0x0a0a0a, { roughness: 0.4 });
    head.add(mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.015, 24), topHat, 0, 0.34, 0));
    head.add(mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.17, 20), topHat, 0, 0.43, 0));
    head.add(mesh(new THREE.CylinderGeometry(0.112, 0.112, 0.03, 20), mat(0xc0a040, { metalness: 0.6, roughness: 0.3 }), 0, 0.37, 0));
  } else if (kind === 'bear') {
    const fur = mat(0x6b4426, { roughness: 0.9 }), light = mat(0xb08a60, { roughness: 0.9 });
    head.add(mesh(new THREE.SphereGeometry(0.22, 24, 16), fur, 0, 0.18, 0));
    for (const s of [-1, 1]) {
      head.add(mesh(new THREE.SphereGeometry(0.07, 12, 10), fur, s * 0.16, 0.36, -0.02));
      head.add(mesh(new THREE.SphereGeometry(0.04, 10, 8), light, s * 0.16, 0.36, 0.02));
      const eyeM = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, emissive: 0x332211, emissiveIntensity: 0.5, roughness: 0.2 });
      const eye = mesh(new THREE.SphereGeometry(0.024, 10, 8), eyeM, s * 0.08, 0.24, 0.185); eye.userData.eye = true; head.add(eye); lids.push(eye); glow.push(eyeM);
    }
    const snout = mesh(new THREE.SphereGeometry(0.1, 16, 12), light, 0, 0.13, 0.17); snout.scale.set(1, 0.75, 0.85); head.add(snout);
    head.add(mesh(new THREE.SphereGeometry(0.035, 10, 8), mat(0x111111, { roughness: 0.3 }), 0, 0.16, 0.255));
    const capM = mat(0x3a3a3a, { roughness: 0.8 });
    const cap = mesh(new THREE.CylinderGeometry(0.2, 0.21, 0.06, 24), capM, 0, 0.37, 0.02); cap.rotation.x = 0.15; head.add(cap);
    const brim = mesh(new THREE.BoxGeometry(0.22, 0.015, 0.1), capM, 0, 0.35, 0.21); brim.rotation.x = 0.25; head.add(brim);
  } else if (kind === 'cat') {
    const fur = mat(0x8a8f99, { roughness: 0.85 }), pink = mat(0xe8a0a8);
    const hd = mesh(new THREE.SphereGeometry(0.2, 24, 16), fur, 0, 0.18, 0); hd.scale.set(1.1, 0.95, 1); head.add(hd);
    for (const s of [-1, 1]) {
      const ear = mesh(new THREE.ConeGeometry(0.075, 0.15, 4), fur, s * 0.12, 0.37, 0); ear.rotation.z = -s * 0.3; head.add(ear);
      const inner = mesh(new THREE.ConeGeometry(0.045, 0.1, 4), pink, s * 0.118, 0.36, 0.025); inner.rotation.z = -s * 0.3; head.add(inner);
      const eyeM = new THREE.MeshStandardMaterial({ color: 0x113311, emissive: 0x66ff66, emissiveIntensity: 1.2, roughness: 0.2 });
      const eye = mesh(new THREE.SphereGeometry(0.04, 12, 10), eyeM, s * 0.075, 0.22, 0.17); eye.scale.set(1, 0.6, 0.5); eye.userData.eye = true; head.add(eye); lids.push(eye); glow.push(eyeM);
      for (let w = -1; w <= 1; w++) { const wh = mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.16, 4), mat(0xeeeeee), s * 0.13, 0.13 + w * 0.02, 0.17); wh.rotation.z = Math.PI / 2 + w * s * 0.15; head.add(wh); }
    }
    const nose = mesh(new THREE.ConeGeometry(0.022, 0.03, 3), pink, 0, 0.15, 0.2); nose.rotation.x = Math.PI; head.add(nose);
    const scarf = mesh(new THREE.TorusGeometry(0.16, 0.045, 8, 24), mat(0xa0203a), 0, 0.72, 0); scarf.rotation.x = Math.PI / 2; upper.add(scarf);
  } else if (kind === 'frog') {
    const gm = mat(0x5f9a3c, { roughness: 0.5 });
    const hd = mesh(new THREE.SphereGeometry(0.22, 24, 16), gm, 0, 0.15, 0); hd.scale.set(1.15, 0.72, 1); head.add(hd);
    const jaw = mesh(new THREE.SphereGeometry(0.2, 24, 16), mat(0xc8d890), 0, 0.1, 0.04); jaw.scale.set(1.02, 0.45, 0.92); head.add(jaw);
    for (const s of [-1, 1]) {
      head.add(mesh(new THREE.SphereGeometry(0.075, 16, 12), gm, s * 0.11, 0.27, 0.05));
      head.add(mesh(new THREE.SphereGeometry(0.06, 16, 12), mat(0xfaf6e0, { roughness: 0.3 }), s * 0.11, 0.285, 0.09));
      const pm = new THREE.MeshStandardMaterial({ color: 0x050505, emissive: 0x40ff60, emissiveIntensity: 0.3, roughness: 0.2 });
      const pup = mesh(new THREE.SphereGeometry(0.03, 10, 8), pm, s * 0.11, 0.29, 0.14); pup.userData.eye = true; lids.push(pup); glow.push(pm); head.add(pup);
    }
    const mo = mesh(new THREE.TorusGeometry(0.12, 0.008, 6, 20, Math.PI * 0.7), mat(0x2a1a10), 0, 0.2, 0.19); mo.rotation.set(0.2, 0, -0.85 * Math.PI); head.add(mo);
    const straw = mat(0xd8b860, { roughness: 0.8 });
    head.add(mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.015, 24), straw, 0, 0.29, -0.02));
    head.add(mesh(new THREE.CylinderGeometry(0.12, 0.125, 0.08, 20), straw, 0, 0.335, -0.02));
    head.add(mesh(new THREE.CylinderGeometry(0.127, 0.127, 0.025, 20), mat(0x8a1a1a), 0, 0.31, -0.02));
    for (const s of [-1, 1]) { const bw = mesh(new THREE.ConeGeometry(0.035, 0.07, 8), mat(0x8a1a1a), s * 0.035, 0.66, 0.19); bw.rotation.z = s * Math.PI / 2; upper.add(bw); }
  } else {
    const skin = mat(0xe2b48c, { roughness: 0.6 });
    head.add(mesh(new THREE.SphereGeometry(0.19, 24, 16), skin, 0, 0.18, 0));
    head.add(mesh(new THREE.SphereGeometry(0.045, 12, 10), mat(0xd08e70), 0, 0.165, 0.19));
    const hair = mat(0x2a1a10);
    for (const s of [-1, 1]) {
      const m = mesh(new THREE.CylinderGeometry(0.028, 0.012, 0.13, 8), hair, s * 0.062, 0.115, 0.172); m.rotation.z = s * (Math.PI / 2 - 0.35); head.add(m);
      const eyeM = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, emissive: 0x332211, emissiveIntensity: 0.4, roughness: 0.2 });
      const eye = mesh(new THREE.SphereGeometry(0.022, 10, 8), eyeM, s * 0.065, 0.215, 0.168); head.add(eye); eye.userData.eye = true; lids.push(eye); glow.push(eyeM);
      const brow = mesh(new THREE.BoxGeometry(0.07, 0.015, 0.02), hair, s * 0.065, 0.255, 0.165); brow.rotation.z = -s * 0.15; head.add(brow);
    }
    const hatM = mat(0x111111, { roughness: 0.5 });
    head.add(mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.02, 28), hatM, 0, 0.33, 0));
    head.add(mesh(new THREE.SphereGeometry(0.175, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), hatM, 0, 0.33, 0));
    head.add(mesh(new THREE.CylinderGeometry(0.178, 0.178, 0.045, 24), mat(0x7a1010), 0, 0.355, 0));
  }
  const fan = new THREE.Group(); fan.position.set(0, 0.92, 0.5); fan.rotation.x = -0.38; root.add(fan);
  glow.forEach(m => { m.userData.e = m.emissiveIntensity; });
  return { root, upper, head, arms, fan, glow, lids, yaw: 0, pitch: 0 };
}

// ---------- rewolwer ----------
function makeGun() {
  const g = new THREE.Group(), s = new THREE.Group(); g.add(s);
  const metal = mat(0x2a2a2e, { metalness: 0.85, roughness: 0.32 });
  const dark = mat(0x0a0a0a, { roughness: 0.9 });
  s.add(mesh(new THREE.BoxGeometry(0.05, 0.085, 0.2), metal, 0, 0.01, 0));
  const barrel = mesh(new THREE.CylinderGeometry(0.019, 0.021, 0.3, 12), metal, 0, 0.03, 0.25); barrel.rotation.x = Math.PI / 2; s.add(barrel);
  s.add(mesh(new THREE.BoxGeometry(0.03, 0.022, 0.28), metal, 0, 0.052, 0.24));
  const drum = new THREE.Group(); drum.position.set(0, 0.018, 0.035); s.add(drum);
  const dm = mesh(new THREE.CylinderGeometry(0.056, 0.056, 0.1, 18), metal); dm.rotation.x = Math.PI / 2; drum.add(dm);
  for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; const h = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.102, 8), dark, Math.cos(a) * 0.033, Math.sin(a) * 0.033, 0); h.rotation.x = Math.PI / 2; drum.add(h); }
  const grip = mesh(new THREE.BoxGeometry(0.046, 0.17, 0.07), mat(0x5a2e14, { roughness: 0.55 }), 0, -0.1, -0.115); grip.rotation.x = -0.38; s.add(grip);
  s.add(mesh(new THREE.BoxGeometry(0.02, 0.04, 0.03), metal, 0, 0.065, -0.1));
  const guard = mesh(new THREE.TorusGeometry(0.035, 0.006, 6, 14, Math.PI), metal, 0, -0.035, -0.02); guard.rotation.set(0, Math.PI / 2, Math.PI); s.add(guard);
  s.add(mesh(new THREE.BoxGeometry(0.008, 0.02, 0.012), metal, 0, 0.073, 0.385));
  const tip = new THREE.Object3D(); tip.position.set(0, 0.03, 0.42); s.add(tip);
  g.scale.setScalar(1.3);
  const flashL = new THREE.PointLight(0xffaa55, 0, 4, 2); tip.add(flashL);
  const flashM = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffd080, transparent: true, opacity: 0, toneMapped: false }));
  tip.add(flashM);
  return { g, drum, tip, flashL, flashM };
}
const gun = makeGun(); scene.add(gun.g);
const GUN_REST_POS = new V3(0.7, tableY + 0.075, 0.32);
const GUN_REST_Q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 2.3, Math.PI / 2));
gun.g.position.copy(GUN_REST_POS); gun.g.quaternion.copy(GUN_REST_Q);

