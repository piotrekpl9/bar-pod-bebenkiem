'use strict';
const $ = s => document.querySelector(s);
const V3 = THREE.Vector3;
const rnd = Math.random;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };

// ---------- teksty ----------
const TYPES = ['K', 'Q', 'A'];
const NAMES = { K: ['król', 'króle', 'króle'], Q: ['dama', 'damy', 'damy'], A: ['as', 'asy', 'asy'] };
const NUMS = { K: ['Jeden', 'Dwa', 'Trzy'], Q: ['Jedna', 'Dwie', 'Trzy'], A: ['Jeden', 'Dwa', 'Trzy'] };
const FULL = { K: 'KRÓLE', Q: 'DAMY', A: 'ASY' };
const claimText = (t, n) => `${NUMS[t][n - 1]} ${NAMES[t][n - 1]}.`;
const SPECIAL_NAMES = { J: 'Joker', D: 'Diabeł', M: 'Lustro', X: 'Podwójny strzał' };
const cardLabel = c => SPECIAL_NAMES[c] || c;

