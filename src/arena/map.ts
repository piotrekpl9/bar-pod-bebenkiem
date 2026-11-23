// Mapa automatu: „Piaskowy Plac” – autorska arenka 1v1 w pustynnym klimacie.
// Wszystko to prostopadłościany (AABB): te same pudełka służą do kolizji, strzałów i rysowania.
// Zachodnia połowa jest zaprojektowana ręcznie, wschodnia to jej odbicie środkowe (x,z → −x,−z),
// więc obie strony mają dokładnie takie same szanse.

export type Mat = 'wall' | 'stone' | 'crate' | 'barrel' | 'roof' | 'door';

export interface Box { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number; m: Mat }

export interface Spawn { x: number; z: number; yaw: number }

const B = (x0: number, z0: number, x1: number, z1: number, y1: number, m: Mat = 'wall', y0 = 0): Box =>
  ({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), y0, y1, m });

/** Odbicie środkowe – połowa wschodnia. */
export const mirror = (b: Box): Box => ({ ...b, x0: -b.x1, x1: -b.x0, z0: -b.z1, z1: -b.z0 });

/** Granice areny (wnętrze murów). */
export const BOUNDS = { x: 26, z: 16 };
export const WALL_H = 6;

const outer: Box[] = [
  B(-27, -17, 27, -16, WALL_H), B(-27, 16, 27, 17, WALL_H),
  B(-27, -16, -26, 16, WALL_H), B(26, -16, 27, 16, WALL_H),
];

// Środek: budynek przecięty tunelem, w tunelu uchylone drzwi.
const center: Box[] = [
  B(-6, 1.2, 6, 4, 5), B(-6, -4, 6, -1.2, 5),
  B(-6, -1.2, 6, 1.2, 5, 'wall', 3.2), // strop nad tunelem
  B(-0.2, -1.2, 0.2, -0.1, 3.2, 'door'),
];

// Zachodnia połowa (spawn A).
const west: Box[] = [
  // mur osłaniający spawn
  B(-17, -3.5, -16, 3.5, 4),
  // skrzynie przy spawnie
  B(-20.5, -5.5, -19.3, -4.3, 1.2, 'crate'),
  B(-20.5, 4.3, -19.3, 5.5, 1.2, 'crate'), B(-20.3, 4.5, -19.5, 5.3, 2.0, 'crate', 1.2),
  // podest ze schodami (widok na północny pas)
  B(-25, 7.6, -20, 8.4, 0.4, 'stone'), B(-25, 8.4, -20, 9.2, 0.8, 'stone'), B(-25, 9.2, -20, 10, 1.2, 'stone'),
  B(-25, 10, -20, 15.5, 1.6, 'stone'),
  // północny pas: róg budynku, niski murek, skrzynie
  B(-16, 13, -11, 16, 4.5),
  B(-12, 9, -8, 9.6, 1.0, 'stone'),
  B(-4, 11.5, -2.6, 12.9, 1.2, 'crate'), B(-3.9, 11.6, -2.7, 12.8, 2.3, 'crate', 1.2),
  // dziedziniec przed tunelem: studnia
  B(-12, -1, -10, 1, 1.0, 'stone'),
  // południe: zaułek oddzielony murem, częściowo zadaszony
  B(-14, -9, -5, -8.5, 4),
  B(-17, -16, -16, -12.5, 4.5),
  B(-14, -16, -8, -9, 3.7, 'roof', 3.4),
  B(-11, -15.5, -10.2, -14.7, 1.0, 'barrel'), B(-10.1, -15.6, -9.3, -14.8, 1.0, 'barrel'),
  B(-10, -7.5, -8.8, -6.3, 1.2, 'crate'),
  // skrzynie przy budynku – zasłaniają linię spawn–spawn wzdłuż ściany
  B(-3, -5.4, -1.6, -4, 1.2, 'crate'), B(-2.9, -5.3, -1.7, -4.1, 2.2, 'crate', 1.2),
];

export const MAP: Box[] = [...outer, ...center, ...west, ...west.map(mirror)];

// yaw = 0 patrzy w −z; −π/2 patrzy w +x
export const SPAWNS: [Spawn[], Spawn[]] = [
  [{ x: -23, z: 0, yaw: -Math.PI / 2 }, { x: -24, z: -4, yaw: -Math.PI / 2 }, { x: -21.5, z: 5.6, yaw: -Math.PI / 2 }],
  [{ x: 23, z: 0, yaw: Math.PI / 2 }, { x: 24, z: 4, yaw: Math.PI / 2 }, { x: 21.5, z: -5.6, yaw: Math.PI / 2 }],
];

/** Markizy nad wejściami – bez kolizji, tylko do rysowania. (x, z) to punkt na ścianie, `ry` – kierunek od ściany. */
export const AWNINGS: { x: number; z: number; w: number; d: number; y: number; ry: number; c: number }[] = [
  { x: -3, z: 4, w: 3.4, d: 1.7, y: 3.4, ry: 0, c: 0xb3412e }, { x: 3, z: -4, w: 3.4, d: 1.7, y: 3.4, ry: Math.PI, c: 0xb3412e },
  { x: -16, z: 0, w: 3, d: 1.5, y: 3.1, ry: Math.PI / 2, c: 0x2e6b8a }, { x: 16, z: 0, w: 3, d: 1.5, y: 3.1, ry: -Math.PI / 2, c: 0x2e6b8a },
  { x: -9.5, z: -8.5, w: 3, d: 1.5, y: 3.1, ry: 0, c: 0x7a8a2e }, { x: 9.5, z: 8.5, w: 3, d: 1.5, y: 3.1, ry: Math.PI, c: 0x7a8a2e },
];
