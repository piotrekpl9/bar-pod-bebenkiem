// Wszystkie dźwięki są syntezowane na bieżąco (Web Audio), bez plików.

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

let ctx: AudioContext | null = null;
let muted = false;

/** Musi być wywołane z kliknięcia (przeglądarki blokują dźwięk bez gestu). */
export function initAudio(): void {
  try {
    const AC = window.AudioContext || (window as WebkitWindow).webkitAudioContext;
    ctx = ctx || new AC();
    void ctx.resume();
  } catch { ctx = null; }
}

export function toggleMute(): boolean { muted = !muted; return muted; }

function noise(dur: number, freq: number, type: BiquadFilterType, gain: number, decay: number, q = 1): void {
  if (!ctx || muted) return;
  const len = Math.max(1, (ctx.sampleRate * dur) | 0);
  const b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const s = ctx.createBufferSource(); s.buffer = b;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain(); const t = ctx.currentTime;
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0008, t + decay);
  s.connect(f); f.connect(g); g.connect(ctx.destination); s.start(t); s.stop(t + dur);
}

function tone(freq: number, dur: number, gain: number, type: OscillatorType = 'sine', slide?: number): void {
  if (!ctx || muted) return;
  const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + dur + 0.02);
}

export const SFX = {
  card() { noise(0.12, 2200, 'bandpass', 0.35, 0.1, 0.8); },
  tick() { noise(0.03, 3500, 'highpass', 0.35, 0.03); tone(900, 0.02, 0.05, 'square'); },
  click() { noise(0.07, 2800, 'highpass', 0.8, 0.06); tone(1500, 0.04, 0.15, 'square', 700); },
  bang() { noise(1.4, 1200, 'lowpass', 1.2, 1.2); noise(0.15, 4000, 'highpass', 0.6, 0.12); tone(110, 0.6, 1.0, 'sine', 28); },
  beat() { tone(58, 0.16, 0.9, 'sine', 38); setTimeout(() => tone(52, 0.16, 0.65, 'sine', 34), 170); },
  liar() { tone(260, 0.3, 0.18, 'sawtooth', 120); tone(330, 0.3, 0.12, 'square', 150); },
  flip() { noise(0.18, 1600, 'bandpass', 0.3, 0.16, 0.6); },
};
