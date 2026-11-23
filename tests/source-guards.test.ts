import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** Czy w linii jest `.add( … ).position|rotation|scale|quaternion` (z dowolnie zagnieżdżonymi nawiasami). */
function setsPropOnAddResult(line: string): boolean {
  for (let i = line.indexOf('.add('); i >= 0; i = line.indexOf('.add(', i + 1)) {
    let depth = 0, j = i + 4;
    for (; j < line.length; j++) {
      if (line[j] === '(') depth++;
      else if (line[j] === ')' && --depth === 0) break;
    }
    if (/^\)\.(position|rotation|scale|quaternion)\b/.test(line.slice(j))) return true;
  }
  return false;
}

// Object3D.add() zwraca RODZICA, więc `grupa.add(x).position.set(...)` przesuwa całą grupę,
// a nie `x`. Tak pianino wylądowało kiedyś nad stołem i zasłoniło gracza naprzeciwko.
describe('pułapki w kodzie grafiki', () => {
  it('wykrywacz działa', () => {
    expect(setsPropOnAddResult("win.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 2), basic({ map: t }))).position.z = 0.01;")).toBe(true);
    expect(setsPropOnAddResult('g.add(mesh(a, b, 0, 1, 2)).rotation.x = 1;')).toBe(true);
    expect(setsPropOnAddResult('child(g, mesh(a, b)).rotation.x = 1;')).toBe(false);
    expect(setsPropOnAddResult('g.add(mesh(a, b)); x.position.y = 1;')).toBe(false);
  });

  it('nikt nie ustawia pozycji/obrotu na wyniku .add()', () => {
    const dir = 'src/view';
    const bad: string[] = [];
    for (const f of readdirSync(dir).filter(n => n.endsWith('.ts'))) {
      readFileSync(`${dir}/${f}`, 'utf8').split('\n').forEach((line, i) => {
        if (/^\s*(\/\/|\/\*|\*)/.test(line)) return; // komentarze
        if (setsPropOnAddResult(line)) bad.push(`${f}:${i + 1}`);
      });
    }
    expect(bad).toEqual([]);
  });
});
