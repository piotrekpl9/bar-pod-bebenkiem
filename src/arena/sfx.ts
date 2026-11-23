// Dźwięki areny – syntezowane jak w barze. `v` – głośność 0..1 (np. zależnie od odległości).

import { noise, tone } from '../view/audio';

const at = (fn: () => void, ms: number) => setTimeout(fn, ms);

export const ASFX = {
  rifle(v = 1) { noise(0.25, 1800, 'lowpass', 0.9 * v, 0.22); noise(0.06, 5000, 'highpass', 0.35 * v, 0.05); tone(95, 0.12, 0.6 * v, 'sine', 45); },
  pistol(v = 1) { noise(0.18, 2600, 'lowpass', 0.7 * v, 0.15); noise(0.05, 6000, 'highpass', 0.4 * v, 0.04); tone(140, 0.08, 0.4 * v, 'sine', 60); },
  hit() { tone(1800, 0.05, 0.12, 'square', 1400); },
  head() { tone(2400, 0.12, 0.18, 'triangle', 2200); tone(3600, 0.1, 0.08, 'sine'); },
  hurt() { noise(0.12, 600, 'lowpass', 0.5, 0.1); tone(180, 0.15, 0.25, 'sawtooth', 90); },
  step(v = 1) { noise(0.06, 500 + Math.random() * 300, 'lowpass', 0.25 * v, 0.05); },
  land() { noise(0.1, 300, 'lowpass', 0.5, 0.09); },
  reload() { noise(0.05, 3000, 'bandpass', 0.4, 0.04, 2); at(() => noise(0.06, 1800, 'bandpass', 0.5, 0.05, 2), 380); at(() => noise(0.07, 2400, 'bandpass', 0.5, 0.05, 3), 1300); },
  draw() { noise(0.06, 2600, 'bandpass', 0.35, 0.05, 2); },
  empty() { tone(2200, 0.03, 0.12, 'square'); },
  beep() { tone(880, 0.12, 0.18, 'square'); },
  go() { tone(1320, 0.25, 0.2, 'square'); },
  win() { [523, 659, 784, 1046].forEach((f, i) => at(() => tone(f, 0.22, 0.18, 'triangle'), i * 110)); },
  lose() { [392, 330, 262].forEach((f, i) => at(() => tone(f, 0.3, 0.18, 'triangle'), i * 160)); },
};
