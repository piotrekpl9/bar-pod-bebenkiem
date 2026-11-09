import { describe, expect, it } from 'vitest';
import { KINDS } from '../src/core/constants';
import { botSlot } from '../src/core/engine';
import { freeKind, isKind, takenKinds } from '../src/core/kinds';
import type { Kind } from '../src/core/types';

describe('wybór postaci', () => {
  it('daje wybraną postać, jeśli jest wolna', () => {
    expect(freeKind('cat', new Set<Kind>(['frog']))).toBe('cat');
  });
  it('daje pierwszą wolną, gdy wybrana jest zajęta albo nic nie wybrano', () => {
    expect(freeKind('frog', new Set<Kind>(['frog', 'robot']))).toBe('owl');
    expect(freeKind(undefined, new Set<Kind>())).toBe('frog');
  });
  it('przy pełnym stole 8 osób każdy dostaje inną postać', () => {
    const taken = new Set<Kind>();
    for (let i = 0; i < 8; i++) taken.add(freeKind('penguin', taken));
    expect(taken.size).toBe(8);
    expect(() => freeKind('frog', taken)).toThrow();
  });
  it('zbiera zajęte postacie, pomijając wskazane miejsce', () => {
    const seats = [{ kind: 'frog' as Kind }, null, { kind: 'cat' as Kind }];
    expect(takenKinds(seats)).toEqual(new Set(['frog', 'cat']));
    expect(takenKinds(seats, 2)).toEqual(new Set(['frog']));
  });
  it('rozpoznaje poprawne nazwy postaci (dane z sieci)', () => {
    for (const k of KINDS) expect(isKind(k)).toBe(true);
    for (const bad of ['dog', '', null, 3, '__proto__']) expect(isKind(bad)).toBe(false);
  });
  it('bot dostaje imię pasujące do postaci', () => {
    expect(botSlot('cat')).toMatchObject({ name: 'Kasia', kind: 'cat', isBot: true, fill: true });
  });
});
