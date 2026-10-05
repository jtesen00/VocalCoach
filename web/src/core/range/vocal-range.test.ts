import { describe, expect, it } from 'vitest';
import type { PitchFrame } from '../pitch/types';
import { comfortableNote, makeRange, MIN_RANGE_FRAMES, sustainedNote, transpositionToFit } from './vocal-range';

const frames = (midis: (number | null)[]): PitchFrame[] =>
  midis.map((midi, i) => ({ t: i * 0.01, midi, f0: null, clarity: 0.9, levelDb: -20, voiced: midi !== null }));

describe('vocal range', () => {
  it('toma la mediana de la nota sostenida, robusta a errores puntuales', () => {
    const m = Array.from({ length: 60 }, (_, i) => (i === 5 ? 57 : 45.1));
    expect(sustainedNote(frames(m))).toBe(45);
  });

  it('exige suficiente voz', () => {
    expect(sustainedNote(frames(Array(MIN_RANGE_FRAMES - 1).fill(45)))).toBeNull();
  });

  it('ordena grave/agudo aunque se canten al revés', () => {
    expect(makeRange(64, 45)).toEqual({ lowMidi: 45, highMidi: 64 });
  });

  it('transpone un ejercicio en C4–G4 al rango de un barítono (A2–E4)', () => {
    const range = makeRange(45, 64);
    const shift = transpositionToFit([60, 62, 64, 65, 67], range);
    expect(shift).toBe(-9);
    expect(60 + shift).toBeGreaterThanOrEqual(range.lowMidi);
    expect(67 + shift).toBeLessThanOrEqual(range.highMidi);
  });

  it('nota cómoda = centro del rango', () => {
    expect(comfortableNote(makeRange(45, 64))).toBe(55);
  });
});
