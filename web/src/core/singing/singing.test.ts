import { describe, expect, it } from 'vitest';
import type { ExercisePlan } from '../exercises/types';
import { graphemesToPhones, parseSyllable } from './phonemes';
import { hasSingableLyrics, sungScore } from './score';

const phones = (s: string) => graphemesToPhones(s).map((p) => p.phone).join(' ');

describe('fonemas del español cantado', () => {
  it('reglas ortográficas', () => {
    expect(phones('queso')).toBe('k e s o');
    expect(phones('guitarra')).toBe('g i t a rr a');
    expect(phones('gente')).toBe('x e n t e');
    expect(phones('cielo')).toBe('s i e l o');
    expect(phones('casa')).toBe('k a s a');
    expect(phones('chico')).toBe('ch i k o');
    expect(phones('llueve')).toBe('y u e b e');
    expect(phones('hoy')).toBe('o i');
    expect(phones('yo')).toBe('y o');
    expect(phones('niño')).toBe('n i ny o');
    expect(phones('rosa')).toBe('rr o s a');
    expect(phones('pero')).toBe('p e r o');
    expect(phones('zapato')).toBe('s a p a t o');
    expect(phones('¡Luz,')).toBe('l u s');
  });

  it('sílabas: ataque, núcleo con diptongos y coda', () => {
    expect(parseSyllable('mor')).toEqual({ onset: ['m'], glideIn: [], main: 'o', glideOut: [], coda: ['r'] });
    expect(parseSyllable('cie')).toEqual({ onset: ['s'], glideIn: ['i'], main: 'e', glideOut: [], coda: [] });
    expect(parseSyllable('rey')).toEqual({ onset: ['rr'], glideIn: [], main: 'e', glideOut: ['i'], coda: [] });
    expect(parseSyllable('pues')).toMatchObject({ onset: ['p'], glideIn: ['u'], main: 'e', coda: ['s'] });
    // Hiato con tilde: se sostiene la vocal cerrada.
    expect(parseSyllable('í')).toMatchObject({ main: 'i' });
    expect(parseSyllable('trans')).toMatchObject({ onset: ['t', 'r'], main: 'a', coda: ['n', 's'] });
    expect(parseSyllable('')).toBeNull();
    expect(parseSyllable('~')).toBeNull();
  });
});

/** Plan mínimo con sílabas en `label`. */
function plan(notes: [string, number, number][], gap = 0): ExercisePlan {
  let t = 0;
  const segments = notes.map(([label, midi, dur]) => {
    const s = { startS: t, endS: t + dur, fromMidi: midi, toMidi: midi, label };
    t += dur + gap;
    return s;
  });
  return { def: { id: 'x', kind: 'sequence', title: '', summary: '', instructions: '', level: 'beginner', notes: [] }, rootMidi: 60, segments, durationS: t - gap } as ExercisePlan;
}

describe('partitura cantada', () => {
  it('la consonante de ataque se adelanta y la vocal llena la nota', () => {
    const s = sungScore(plan([['la', 60, 0.5], ['mor', 62, 0.8]]));
    expect(s.phones.map((p) => p.phone)).toEqual(['l', 'a', 'm', 'o', 'r']);
    const m = s.phones[2];
    expect(m.startS).toBeLessThan(0.5); // se adelanta sobre «la»
    expect(m.endS).toBeGreaterThan(0.5);
    const o = s.phones[3];
    expect(o.endS - o.startS).toBeGreaterThan(0.55 * 0.8 * 0.9);
    // Sin huecos ni solapes.
    for (let i = 1; i < s.phones.length; i++) expect(s.phones[i].startS).toBeCloseTo(s.phones[i - 1].endS, 6);
    expect(s.phones.at(-1)!.endS).toBeCloseTo(1.3, 6);
  });

  it('tras un silencio la consonante no se adelanta', () => {
    const s = sungScore(plan([['sol', 60, 0.5], ['mar', 62, 0.5]], 0.3));
    expect(s.phones.find((p, i) => i > 0 && p.phone === 'm')!.startS).toBeCloseTo(0.8, 6);
  });

  it('las notas sin sílaba alargan la vocal anterior (melisma)', () => {
    const s = sungScore(plan([['a', 60, 0.4], ['', 62, 0.4], ['', 64, 0.4]]));
    expect(s.phones.map((p) => p.phone)).toEqual(['a']);
    expect(s.phones[0].endS).toBeCloseTo(1.2, 9);
    expect(s.pitch.map((p) => p.fromMidi)).toEqual([60, 62, 64]);
  });

  it('una frase sin letra se canta «u» y no cuenta como cantable', () => {
    const p = plan([['', 60, 0.5], ['', 62, 0.5]]);
    expect(hasSingableLyrics(p)).toBe(false);
    expect(sungScore(p).phones.map((x) => x.phone)).toEqual(['u']);
  });

  it('las consonantes se encogen en notas muy cortas', () => {
    const s = sungScore(plan([['trans', 60, 0.15]]));
    const vowel = s.phones.find((p) => p.phone === 'a')!;
    expect(vowel.endS - vowel.startS).toBeGreaterThanOrEqual(0.04);
    expect(s.phones.at(-1)!.endS).toBeLessThanOrEqual(0.15 + 1e-9);
  });
});
