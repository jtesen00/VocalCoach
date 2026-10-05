import { describe, expect, it } from 'vitest';
import type { PitchFrame } from '../pitch/types';
import { centsVsTarget, classifyCents, noteAccuracy, TOLERANCE_BY_LEVEL } from './pitch-scoring';

const frame = (t: number, midi: number | null): PitchFrame => ({
  t, midi, f0: null, clarity: 0.95, levelDb: -20, voiced: midi !== null,
});

describe('centsVsTarget', () => {
  it('mide contra el objetivo, no contra la nota más cercana', () => {
    // Objetivo C4, el usuario canta C#4 −40 cents → +60 respecto al objetivo.
    expect(centsVsTarget(61 - 0.4, 60, 'exact')).toBeCloseTo(60, 6);
  });

  it('modo exact: la octava cuenta', () => {
    expect(centsVsTarget(48, 60, 'exact')).toBeCloseTo(-1200, 6);
  });

  it('modo pitch-class: ignora la octava', () => {
    expect(centsVsTarget(48.05, 60, 'pitch-class')).toBeCloseTo(5, 6);
    expect(centsVsTarget(72 - 0.2, 60, 'pitch-class')).toBeCloseTo(-20, 6);
  });
});

describe('classifyCents', () => {
  const tol = TOLERANCE_BY_LEVEL.beginner;
  it.each([
    [0, 'perfect'], [15, 'perfect'], [-25, 'close'], [31, 'too_high'], [-40, 'too_low'], [null, 'no_voice'],
  ] as const)('%s cents → %s', (c, status) => {
    expect(classifyCents(c, tol)).toBe(status);
  });
});

describe('noteAccuracy', () => {
  const opts = { targetMidi: 60, tolerance: TOLERANCE_BY_LEVEL.beginner, octaveMode: 'exact' as const };

  it('no penaliza el ataque inicial (250 ms)', () => {
    const frames = [
      ...Array.from({ length: 20 }, (_, i) => frame(i * 0.01, 59.2)), // ataque desafinado, 0–190 ms
      ...Array.from({ length: 80 }, (_, i) => frame(0.3 + i * 0.01, 60.05)),
    ];
    const r = noteAccuracy(frames, opts);
    expect(r.accuracy).toBe(1);
    expect(r.medianCents).toBeCloseTo(5, 6);
  });

  it('cuenta solo frames con voz', () => {
    const frames = [
      ...Array.from({ length: 25 }, (_, i) => frame(i * 0.01, 60)), // ataque, 0–240 ms
      ...Array.from({ length: 50 }, (_, i) => frame(0.3 + i * 0.01, i % 2 ? 60 : 61)),
      ...Array.from({ length: 20 }, (_, i) => frame(0.8 + i * 0.01, null)),
    ];
    expect(noteAccuracy(frames, opts).accuracy).toBeCloseTo(0.5, 6);
  });

  it('sin voz → null', () => {
    expect(noteAccuracy([frame(0, null)], opts).accuracy).toBeNull();
  });
});
