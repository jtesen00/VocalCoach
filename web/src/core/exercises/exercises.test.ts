import { describe, expect, it } from 'vitest';
import { midiToFreq } from '../music/notes';
import { createDetector, DEFAULT_DETECTOR_OPTIONS, rmsDb } from '../pitch/detector';
import { frames as windows, rng, tone, VOICE_LIKE_HARMONICS } from '../pitch/signals';
import { PitchTracker } from '../pitch/tracker';
import type { PitchFrame } from '../pitch/types';
import { makeRange } from '../range/vocal-range';
import { TOLERANCE_BY_LEVEL } from '../scoring/pitch-scoring';
import { EXERCISES, findExercise } from './catalog';
import { evaluateExercise, type EvaluationOptions } from './evaluate';
import { basicFeedback } from './feedback';
import { buildPlan, rootForRange, targetAt } from './plan';
import { analyseStability } from './stability';
import type { ExercisePlan } from './types';

const RATE = 94;
const opts: EvaluationOptions = { tolerance: TOLERANCE_BY_LEVEL.beginner, octaveMode: 'exact', startT: 10 };

/** Frames sintéticos: `midiAt(t)` con t en segundos desde el inicio del canto; null = silencio. */
function synth(durationS: number, midiAt: (t: number) => number | null, startT = 10): PitchFrame[] {
  const out: PitchFrame[] = [];
  for (let i = 0; i < durationS * RATE; i++) {
    const t = i / RATE;
    const midi = midiAt(t);
    out.push({ t: startT + t, midi, f0: midi === null ? null : midiToFreq(midi), clarity: 0.95, levelDb: -20, voiced: midi !== null });
  }
  return out;
}

const plan = (id: string, root = 60): ExercisePlan => buildPlan(findExercise(id)!, root);

describe('catálogo y plan', () => {
  it('todos los ejercicios tienen id único y generan un plan válido', () => {
    expect(new Set(EXERCISES.map((e) => e.id)).size).toBe(EXERCISES.length);
    for (const def of EXERCISES) {
      const p = buildPlan(def, 60);
      expect(p.durationS).toBeGreaterThan(0);
      expect(p.segments.length).toBeGreaterThan(0);
    }
  });

  it('transpone la escala de cinco notas al rango de un barítono', () => {
    const def = findExercise('scale-five')!;
    const root = rootForRange(def, makeRange(45, 64)); // A2–E4
    expect(root).toBe(51); // D#3–A#3, centrado en el rango
    expect(rootForRange(def, null)).toBe(60);
  });

  it('interpola la guía de la sirena', () => {
    const p = plan('siren-up-down');
    expect(targetAt(p, 0)).toBe(60);
    expect(targetAt(p, 1.25)).toBeCloseTo(66, 6);
    expect(targetAt(p, 2.5)).toBe(72);
    expect(targetAt(p, 6)).toBeNull();
  });
});

describe('estabilidad y vibrato', () => {
  it('nota fija → estabilidad 1, sin vibrato', () => {
    const a = analyseStability(Array(200).fill(5), RATE)!;
    expect(a.stability).toBeCloseTo(1, 6);
    expect(a.vibrato).toBeNull();
  });

  it('detecta vibrato de 5,5 Hz ±50 c y no lo penaliza', () => {
    const cents = Array.from({ length: 300 }, (_, i) => 50 * Math.sin((2 * Math.PI * 5.5 * i) / RATE));
    const a = analyseStability(cents, RATE)!;
    expect(a.vibrato).not.toBeNull();
    expect(a.vibrato!.rateHz).toBeCloseTo(5.5, 0);
    expect(a.vibrato!.extentCents).toBeGreaterThan(30);
    expect(a.stability).toBeGreaterThan(0.8);
  });

  it('temblor aleatorio grande → inestable, sin vibrato', () => {
    const r = rng(5);
    const a = analyseStability(Array.from({ length: 300 }, () => (r() - 0.5) * 140), RATE)!;
    expect(a.vibrato).toBeNull();
    expect(a.stability).toBeLessThan(0.35);
  });
});

describe('nota sostenida', () => {
  it('afinada → perfecto y superado', () => {
    const e = evaluateExercise(plan('sustained-3s'), synth(3, () => 60.05), opts);
    expect(e.notes[0].status).toBe('perfect');
    expect(e.passed).toBe(true);
    expect(e.score).toBeGreaterThanOrEqual(95);
    expect(basicFeedback(e)[0].id).toBe('great');
  });

  it('el ataque desafinado (primeros 250 ms) no penaliza', () => {
    const e = evaluateExercise(plan('sustained-3s'), synth(3, (t) => (t < 0.2 ? 58.8 : 60)), opts);
    expect(e.accuracy).toBe(1);
  });

  it('constantemente −40 c → demasiado bajo, con consejo', () => {
    const e = evaluateExercise(plan('sustained-3s'), synth(3, () => 59.6), opts);
    expect(e.notes[0].status).toBe('too_low');
    expect(e.passed).toBe(false);
    expect(basicFeedback(e).map((m) => m.id)).toContain('consistently-low');
  });

  it('vibrato centrado → bien evaluado y mencionado', () => {
    const e = evaluateExercise(plan('sustained-3s'), synth(3, (t) => 60 + 0.4 * Math.sin(2 * Math.PI * 5.5 * t)), opts);
    expect(['perfect', 'close']).toContain(e.notes[0].status);
    expect(e.notes[0].vibrato).not.toBeNull();
    expect(basicFeedback(e, 5).map((m) => m.id)).toContain('vibrato');
  });

  it('temblor aleatorio → inestable', () => {
    const r = rng(9);
    const e = evaluateExercise(plan('sustained-3s'), synth(3, () => 60 + (r() - 0.5) * 1.4), opts);
    expect(e.notes[0].status).toBe('unstable');
    expect(basicFeedback(e).map((m) => m.id)).toContain('unstable');
  });

  it('la nota cae al final → consejo de reservar aire', () => {
    const e = evaluateExercise(plan('sustained-3s'), synth(3, (t) => (t < 2 ? 60 : 60 - 0.35 * (t - 2) * 2)), opts);
    expect(e.notes[0].endDriftCents!).toBeLessThan(-20);
    expect(basicFeedback(e, 5).map((m) => m.id)).toContain('falling-end');
  });

  it('silencio → sin voz', () => {
    const e = evaluateExercise(plan('sustained-3s'), synth(3, () => null), opts);
    expect(e.notes[0].status).toBe('no_voice');
    expect(e.passed).toBe(false);
    expect(basicFeedback(e).map((m) => m.id)).toEqual(['no-voice']);
  });

  it('modo cualquier octava: una octava abajo cuenta como afinado', () => {
    const p = plan('sustained-3s');
    expect(evaluateExercise(p, synth(3, () => 48), opts).notes[0].status).toBe('too_low');
    expect(evaluateExercise(p, synth(3, () => 48), { ...opts, octaveMode: 'pitch-class' }).notes[0].status).toBe('perfect');
  });

  it('compensa la latencia', () => {
    // La voz llega 80 ms tarde y la ventana dura 3 s: sin compensar, el final cae fuera.
    const late = synth(3, (t) => (t < 0.08 ? null : 60), 10).map((f) => ({ ...f }));
    const e = evaluateExercise(plan('sustained-3s'), late, { ...opts, latencyS: 0.08 });
    expect(e.passed).toBe(true);
  });
});

describe('secuencias e intervalos', () => {
  const doReMi = plan('steps-do-re-mi'); // 60 62 64 62 60, 0,9 s cada una
  const sing = (notes: number[], dur = 0.9) => (t: number) => notes[Math.min(notes.length - 1, Math.floor(t / dur))];

  it('secuencia correcta → todas perfectas', () => {
    const e = evaluateExercise(doReMi, synth(4.5, sing([60, 62, 64, 62, 60])), opts);
    expect(e.notes.map((n) => n.status)).toEqual(Array(5).fill('perfect'));
    expect(e.passed).toBe(true);
  });

  it('las transiciones dentro del ataque no penalizan', () => {
    // Cada nota llega 150 ms tarde (deslizando desde la anterior).
    const notes = [60, 62, 64, 62, 60];
    const e = evaluateExercise(doReMi, synth(4.5, (t) => {
      const i = Math.floor(t / 0.9);
      const into = t - i * 0.9;
      return into < 0.15 && i > 0 ? notes[i - 1] + (notes[i] - notes[i - 1]) * (into / 0.15) : notes[Math.min(4, i)];
    }), opts);
    expect(e.accuracy).toBe(1);
  });

  it('una nota equivocada se señala (1 de 5 = 80 %: justo en el umbral)', () => {
    const e = evaluateExercise(doReMi, synth(4.5, sing([60, 62, 63.4, 62, 60])), opts);
    expect(e.notes[2].status).toBe('too_low');
    expect(e.accuracy).toBeCloseTo(0.8, 2);
    const fb = basicFeedback(e);
    expect(fb.find((m) => m.id === 'wrong-notes')!.text).toContain('nota 3 (E4)');
  });

  it('dos notas equivocadas → no superado', () => {
    const e = evaluateExercise(doReMi, synth(4.5, sing([60, 62.5, 63.4, 62, 60])), opts);
    expect(e.passed).toBe(false);
  });

  it('una nota sin cantar → no superado', () => {
    const e = evaluateExercise(doReMi, synth(4.5, (t) => (t >= 1.8 && t < 2.7 ? null : sing([60, 62, 64, 62, 60])(t))), opts);
    expect(e.notes[2].status).toBe('no_voice');
    expect(e.passed).toBe(false);
    expect(basicFeedback(e).map((m) => m.id)).toContain('missing-notes');
  });

  it('cantar siempre la misma nota → "sigue la guía", no un consejo de afinación', () => {
    const e = evaluateExercise(plan('scale-five'), synth(6.3, () => 61), opts);
    const ids = basicFeedback(e, 5).map((m) => m.id);
    expect(ids).toContain('not-following');
    expect(ids).not.toContain('consistently-low');
    expect(ids).not.toContain('consistently-high');
  });

  it('intervalo: mide el salto cantado', () => {
    const p = plan('interval-fifth');
    const e = evaluateExercise(p, synth(3, (t) => (t < 1.5 ? 60 : 66.6)), opts);
    expect(e.interval!.targetCents).toBe(700);
    expect(e.interval!.errorCents!).toBeCloseTo(-40, 6);
    expect(basicFeedback(e, 5).find((m) => m.id === 'interval')!.text).toContain('corto');
  });
});

describe('sirenas', () => {
  const up = plan('siren-up'); // 60 → 72 en 3 s

  it('deslizamiento completo y continuo → superado', () => {
    const e = evaluateExercise(up, synth(3, (t) => 60 + 12 * (t / 3)), opts);
    expect(e.siren!.coverage).toBe(1);
    expect(e.siren!.direction).toBeGreaterThan(0.95);
    expect(e.siren!.breaks).toBe(0);
    expect(e.passed).toBe(true);
  });

  it('no se evalúa como notas aisladas: el tiempo exacto no importa', () => {
    // Sube más deprisa y se queda arriba: sigue siendo una sirena válida.
    const e = evaluateExercise(up, synth(3, (t) => Math.min(72, 60 + 12 * (t / 2))), opts);
    expect(e.passed).toBe(true);
  });

  it('cortes → se cuentan y se aconseja continuidad', () => {
    const e = evaluateExercise(up, synth(3, (t) => (Math.floor(t / 0.5) % 2 === 1 && t % 0.5 < 0.25 ? null : 60 + 12 * (t / 3))), opts);
    expect(e.siren!.breaks).toBeGreaterThan(1);
    expect(e.passed).toBe(false);
    expect(basicFeedback(e, 5).map((m) => m.id)).toContain('siren-breaks');
  });

  it('recorrido parcial → cobertura baja', () => {
    const e = evaluateExercise(up, synth(3, (t) => 60 + 5 * (t / 3)), opts);
    expect(e.siren!.coverage).toBeLessThan(0.6);
    expect(basicFeedback(e, 5).map((m) => m.id)).toContain('siren-coverage');
  });

  it('dirección contraria → no superado', () => {
    const e = evaluateExercise(up, synth(3, (t) => 72 - 12 * (t / 3)), opts);
    expect(e.siren!.direction).toBeLessThan(0.1);
    expect(e.passed).toBe(false);
  });

  it('cualquier octava: una sirena una octava abajo es válida', () => {
    const e = evaluateExercise(up, synth(3, (t) => 48 + 12 * (t / 3)), { ...opts, octaveMode: 'pitch-class' });
    expect(e.siren!.octaveShift).toBe(12);
    expect(e.passed).toBe(true);
  });
});

describe('integración: audio sintético → detector → tracker → evaluación', () => {
  it('una escala cantada correctamente se supera', () => {
    const SR = 48000;
    const p = plan('scale-five', 55);
    const audio = tone({
      sampleRate: SR,
      durationS: p.durationS,
      hz: (t) => midiToFreq(targetAt(p, t) ?? 55),
      harmonics: VOICE_LIKE_HARMONICS,
    });
    const detector = createDetector('mpm', { sampleRate: SR, ...DEFAULT_DETECTOR_OPTIONS });
    const tracker = new PitchTracker();
    const out: PitchFrame[] = [];
    for (const { frame, end } of windows(audio, DEFAULT_DETECTOR_OPTIONS.windowSize, DEFAULT_DETECTOR_OPTIONS.hopSize)) {
      out.push(tracker.push({ t: end / SR, levelDb: rmsDb(frame), ...detector.detect(frame) }));
    }
    // El frame se fecha al final de la ventana: se compensa media ventana.
    const latencyS = DEFAULT_DETECTOR_OPTIONS.windowSize / 2 / SR;
    const e = evaluateExercise(p, out, { ...opts, startT: 0, latencyS });
    expect(e.notes.every((n) => n.status === 'perfect')).toBe(true);
    expect(e.passed).toBe(true);
  });
});
