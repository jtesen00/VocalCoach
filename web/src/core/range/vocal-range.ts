import type { PitchFrame } from '../pitch/types';

export interface VocalRange {
  /** Nota MIDI más grave cómoda. */
  lowMidi: number;
  /** Nota MIDI más aguda cómoda. */
  highMidi: number;
}

/** Frames con voz necesarios (~0,5 s a 94 frames/s) para aceptar una medición. */
export const MIN_RANGE_FRAMES = 45;

function percentile(sorted: readonly number[], p: number): number {
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
  return sorted[i];
}

function voicedMidis(frames: readonly PitchFrame[]): number[] {
  return frames.filter((f) => f.voiced && f.midi !== null).map((f) => f.midi!).sort((a, b) => a - b);
}

/**
 * Nota sostenida durante la calibración. Se usa la mediana para ser robusto
 * frente a ataques y errores puntuales; null si no hay suficiente voz.
 */
export function sustainedNote(frames: readonly PitchFrame[]): number | null {
  const m = voicedMidis(frames);
  if (m.length < MIN_RANGE_FRAMES) return null;
  return Math.round(percentile(m, 0.5));
}

export function makeRange(a: number, b: number): VocalRange {
  return { lowMidi: Math.min(a, b), highMidi: Math.max(a, b) };
}

/**
 * Transposición (en semitonos) que coloca un ejercicio dentro del rango del usuario,
 * centrándolo. Si el ejercicio no cabe, se centra igualmente (se sale por ambos lados).
 */
export function transpositionToFit(exerciseMidis: readonly number[], range: VocalRange): number {
  const lo = Math.min(...exerciseMidis);
  const hi = Math.max(...exerciseMidis);
  const exerciseCenter = (lo + hi) / 2;
  const rangeCenter = (range.lowMidi + range.highMidi) / 2;
  return Math.round(rangeCenter - exerciseCenter);
}

/** Nota objetivo por defecto para el afinador: el centro del rango. */
export function comfortableNote(range: VocalRange): number {
  return Math.round((range.lowMidi + range.highMidi) / 2);
}
