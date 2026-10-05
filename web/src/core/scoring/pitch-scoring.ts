import { median } from '../pitch/tracker';
import type { PitchFrame } from '../pitch/types';

/**
 * - exact: la octava cuenta (cantar C3 con objetivo C4 = −1200 cents).
 * - pitch-class: se ignora la octava; útil para principiantes y voces fuera del registro del ejercicio.
 */
export type OctaveMode = 'exact' | 'pitch-class';

export type SkillLevel = 'beginner' | 'intermediate' | 'advanced';

export interface Tolerance {
  /** |cents| ≤ perfectCents → "perfect". */
  perfectCents: number;
  /** |cents| ≤ toleranceCents → cuenta como afinado ("close" si no es perfect). */
  toleranceCents: number;
}

/** Hipótesis iniciales (docs/PLAN.md §2); se ajustan con grabaciones reales. */
export const TOLERANCE_BY_LEVEL: Record<SkillLevel, Tolerance> = {
  beginner: { perfectCents: 15, toleranceCents: 30 },
  intermediate: { perfectCents: 10, toleranceCents: 20 },
  advanced: { perfectCents: 5, toleranceCents: 10 },
};

/** Ataque inicial de cada nota que no se evalúa (docs/PLAN.md §2, punto 4). */
export const DEFAULT_ATTACK_MS = 250;

export function centsVsTarget(midi: number, targetMidi: number, mode: OctaveMode): number {
  let d = midi - targetMidi;
  if (mode === 'pitch-class') d -= 12 * Math.round(d / 12);
  return d * 100;
}

export type PitchStatus = 'perfect' | 'close' | 'too_high' | 'too_low' | 'no_voice';

export function classifyCents(cents: number | null, tol: Tolerance): PitchStatus {
  if (cents === null) return 'no_voice';
  const a = Math.abs(cents);
  if (a <= tol.perfectCents) return 'perfect';
  if (a <= tol.toleranceCents) return 'close';
  return cents > 0 ? 'too_high' : 'too_low';
}

export interface NoteAccuracyOptions {
  targetMidi: number;
  tolerance: Tolerance;
  octaveMode: OctaveMode;
  attackMs?: number;
}

export interface NoteAccuracy {
  /** % (0..1) de frames con voz, tras el ataque, dentro de la tolerancia. null si no hay frames evaluables. */
  accuracy: number | null;
  medianCents: number | null;
  evaluatedFrames: number;
}

/**
 * Accuracy de una nota sostenida: frames con voz, excluyendo los primeros `attackMs`
 * desde el primer frame con voz, dentro de la tolerancia respecto al objetivo.
 */
export function noteAccuracy(frames: readonly PitchFrame[], opts: NoteAccuracyOptions): NoteAccuracy {
  const attackS = (opts.attackMs ?? DEFAULT_ATTACK_MS) / 1000;
  const first = frames.find((f) => f.voiced && f.midi !== null);
  if (!first) return { accuracy: null, medianCents: null, evaluatedFrames: 0 };

  const cents: number[] = [];
  let inTune = 0;
  for (const f of frames) {
    if (!f.voiced || f.midi === null || f.t < first.t + attackS) continue;
    const c = centsVsTarget(f.midi, opts.targetMidi, opts.octaveMode);
    cents.push(c);
    if (Math.abs(c) <= opts.tolerance.toleranceCents) inTune++;
  }
  if (cents.length === 0) return { accuracy: null, medianCents: null, evaluatedFrames: 0 };
  return { accuracy: inTune / cents.length, medianCents: median(cents), evaluatedFrames: cents.length };
}
