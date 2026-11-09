import * as THREE from 'three';

type Ease = (k: number) => number;
interface Tween { t0: number; dur: number; fn: (k: number) => void; e: Ease; res: () => void }

const tweens: Tween[] = [];
export const easeInOut: Ease = k => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
export const easeOutCubic: Ease = k => 1 - Math.pow(1 - k, 3);

/** Animacja przez `dur` sekund. W ukrytej karcie kończy się od razu (żeby gra hosta nie stanęła). */
export function anim(dur: number, fn: (k: number) => void, e: Ease = easeInOut): Promise<void> {
  if (document.hidden) { fn(e(1)); return Promise.resolve(); }
  return new Promise(res => tweens.push({ t0: performance.now(), dur: dur * 1000, fn, e, res }));
}

export function stepTweens(now: number): void {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    const k = Math.min(1, (now - tw.t0) / tw.dur);
    tw.fn(tw.e(k));
    if (k >= 1) { tweens.splice(i, 1); tw.res(); }
  }
}

function finishTweens(): void {
  while (tweens.length) { const tw = tweens.pop()!; tw.fn(tw.e(1)); tw.res(); }
}
document.addEventListener('visibilitychange', () => { if (document.hidden) finishTweens(); });

/** Przesuwa obiekt łukiem (`arc` = wysokość łuku) i obraca do `toQ`. */
export function moveObj(o: THREE.Object3D, toPos: THREE.Vector3, toQ: THREE.Quaternion | null, dur: number, arc = 0): Promise<void> {
  const p0 = o.position.clone(), q0 = o.quaternion.clone();
  return anim(dur, k => {
    o.position.lerpVectors(p0, toPos, k);
    o.position.y += Math.sin(k * Math.PI) * arc;
    if (toQ) o.quaternion.copy(q0).slerp(toQ, k);
  });
}
