import type { NoteStatus } from '../core/exercises/evaluate';
import type { ExerciseKind } from '../core/exercises/types';
import { noteName, solfegeName } from '../core/music/notes';
import type { PitchStatus, SkillLevel } from '../core/scoring/pitch-scoring';

/** Nombre de nota según el modo: "Do" (sencillo) o "C4" (detalles técnicos). */
export function displayNote(midi: number, detailed: boolean): string {
  return detailed ? noteName(midi) : solfegeName(midi);
}

export const KIND_LABEL: Record<ExerciseKind, string> = {
  sustained: 'Nota larga',
  sequence: 'Melodía',
  interval: 'Salto',
  scale: 'Escala',
  siren: 'Sirena',
};

export const DIFFICULTY_LABEL: Record<SkillLevel, string> = { beginner: 'Fácil', intermediate: 'Media', advanced: 'Difícil' };
export const DIFFICULTY_DOTS: Record<SkillLevel, number> = { beginner: 1, intermediate: 2, advanced: 3 };

/** El nivel de usuario se presenta como "exigencia" de la corrección. */
export const STRICTNESS_LABEL: Record<SkillLevel, { name: string; description: string }> = {
  beginner: { name: 'Relajado', description: 'Acepta pequeñas desviaciones. Ideal para empezar.' },
  intermediate: { name: 'Normal', description: 'Pide bastante precisión.' },
  advanced: { name: 'Exigente', description: 'Solo vale si estás justo en la nota.' },
};

/** Estado en vivo (afinador): qué hacer, no qué está mal. */
export function liveStatus(status: PitchStatus, cents: number | null): { label: string; icon: string; hint: string } {
  const big = cents !== null && Math.abs(cents) > 100;
  switch (status) {
    case 'perfect':
      return { label: '¡Afinado!', icon: '●', hint: 'Mantén la nota así' };
    case 'close':
      return { label: 'Casi', icon: '◐', hint: cents !== null && cents > 0 ? 'Un pelín más grave' : 'Un pelín más agudo' };
    case 'too_high':
      return { label: big ? 'Baja bastante' : 'Baja un poco', icon: '▼', hint: 'Estás por encima de la nota' };
    case 'too_low':
      return { label: big ? 'Sube bastante' : 'Sube un poco', icon: '▲', hint: 'Estás por debajo de la nota' };
    case 'no_voice':
      return { label: 'Canta una nota', icon: '○', hint: 'Una vocal larga, como «aaa»' };
  }
}

export const NOTE_RESULT: Record<NoteStatus, { label: string; icon: string }> = {
  perfect: { label: 'Bien', icon: '●' },
  close: { label: 'Casi', icon: '◐' },
  too_high: { label: 'Alta', icon: '▼' },
  too_low: { label: 'Baja', icon: '▲' },
  unstable: { label: 'Inestable', icon: '≈' },
  no_voice: { label: 'No se oyó', icon: '○' },
};

/** 0–3 estrellas: 3 = superado con nota alta; 2 = superado; 1 = va por buen camino. */
export function stars(score: number, passed: boolean): number {
  if (passed && score >= 90) return 3;
  if (passed) return 2;
  return score >= 50 ? 1 : 0;
}
