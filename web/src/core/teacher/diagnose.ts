import type { ExerciseEvaluation, NoteEvaluation } from '../exercises/evaluate';
import type { OctaveMode } from '../scoring/pitch-scoring';

/**
 * Taxonomía de lo que el profesor detecta en un intento. Solo comportamiento acústico:
 * nunca se infiere nada del cuerpo (diafragma, cuerdas vocales, tensión…).
 */
export type DiagnosisId =
  | 'no_voice' // no se oyó nada
  | 'octave_off' // canta la melodía correcta en otra octava (con "octava exacta")
  | 'not_following' // mantiene la misma nota aunque la melodía se mueve
  | 'missing_notes' // algunas notas no se oyeron
  | 'wrong_notes' // algunas notas a más de un semitono
  | 'siren_direction' // la sirena no sigue la dirección
  | 'siren_range' // la sirena no cubre el recorrido
  | 'siren_breaks' // la sirena se corta
  | 'interval_short' // el salto se queda corto
  | 'interval_long' // el salto se pasa
  | 'flat' // sesgo: algo por debajo (≤ 1 semitono)
  | 'sharp' // sesgo: algo por encima (≤ 1 semitono)
  | 'unstable' // la altura oscila sin patrón
  | 'falling_end' // la nota cae al final
  | 'vibrato' // informativo: no es un error
  | 'almost' // sin error claro, pero no llega al 80 %
  | 'good' // superado
  | 'great'; // superado con nota alta

export interface Diagnosis {
  id: DiagnosisId;
  /** Notas implicadas (índices en el ejercicio). */
  notes: number[];
  /** Magnitud relevante en cents (media del sesgo, error del intervalo, caída final…). */
  cents: number | null;
}

/** Orden del árbol de decisión: lo primero que hay que corregir va antes. */
export const PRIORITY: readonly DiagnosisId[] = [
  'no_voice',
  'octave_off',
  'not_following',
  'missing_notes',
  'wrong_notes',
  'siren_direction',
  'siren_range',
  'siren_breaks',
  'interval_short',
  'interval_long',
  'flat',
  'sharp',
  'falling_end',
  'unstable',
  'almost',
  'great',
  'good',
  'vibrato',
];

/** Diagnósticos que no son errores. */
export const POSITIVE: ReadonlySet<DiagnosisId> = new Set(['great', 'good', 'vibrato']);

const sung = (e: ExerciseEvaluation) => e.notes.filter((n) => n.medianCents !== null);
const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / x.length;
const idx = (notes: NoteEvaluation[]) => notes.map((n) => n.index);

/** Todos los diagnósticos que aplican a un intento, ordenados por prioridad. */
export function diagnose(e: ExerciseEvaluation, octaveMode: OctaveMode): Diagnosis[] {
  const out: Diagnosis[] = [];
  const add = (id: DiagnosisId, notes: number[] = [], cents: number | null = null) => out.push({ id, notes, cents });
  const s = sung(e);

  if (e.siren) {
    const sr = e.siren;
    if (sr.reachedHighMidi === null) add('no_voice');
    else {
      // Si apenas se movió, el problema es el recorrido, no la dirección.
      if (sr.direction < 0.7 && sr.coverage >= 0.3) add('siren_direction');
      if (sr.coverage < 0.8) add('siren_range', [], Math.round(sr.coverage * 100));
      if (sr.breaks > 1) add('siren_breaks', [], sr.breaks);
    }
  } else if (s.length === 0) {
    add('no_voice');
  } else {
    // Otra octava: la mayoría de notas a ±12 (o ±24) semitonos casi exactos.
    if (octaveMode === 'exact') {
      const octave = s.filter((n) => {
        const r = Math.abs(n.medianCents!) % 1200;
        return Math.abs(n.medianCents!) >= 1100 && (r <= 60 || r >= 1140);
      });
      if (octave.length / s.length >= 0.5) add('octave_off', idx(octave), Math.sign(mean(octave.map((n) => n.medianCents!))) * 1200);
    }

    const targets = e.notes.map((n) => n.targetMidi);
    if (s.length >= 2 && Math.max(...targets) - Math.min(...targets) >= 2) {
      const midis = s.map((n) => n.targetMidi + n.medianCents! / 100);
      if (Math.max(...midis) - Math.min(...midis) < 1) add('not_following');
    }

    const missing = e.notes.filter((n) => n.status === 'no_voice');
    if (missing.length) add('missing_notes', idx(missing));

    const far = s.filter((n) => Math.abs(n.medianCents!) > 100);
    if (far.length && !out.some((d) => d.id === 'octave_off')) add('wrong_notes', idx(far));

    if (e.interval?.errorCents != null && Math.abs(e.interval.errorCents) > 30) {
      add(e.interval.errorCents < 0 ? 'interval_short' : 'interval_long', [1], e.interval.errorCents);
    }

    // Sesgo de afinación: la mitad o más de las notas cantadas, al mismo lado y a menos de un semitono.
    for (const [side, id] of [['too_low', 'flat'], ['too_high', 'sharp']] as const) {
      const biased = s.filter((n) => n.status === side && Math.abs(n.medianCents!) <= 100);
      if (biased.length / s.length >= 0.5) add(id, idx(biased), mean(biased.map((n) => n.medianCents!)));
    }

    const unstable = e.notes.filter((n) => n.status === 'unstable');
    if (unstable.length) add('unstable', idx(unstable));

    if (e.kind === 'sustained' && e.notes[0].endDriftCents != null && e.notes[0].endDriftCents <= -20) {
      add('falling_end', [0], e.notes[0].endDriftCents);
    }

    const vib = e.notes.filter((n) => n.vibrato);
    if (vib.length) add('vibrato', idx(vib));
  }

  if (e.passed) add(e.score >= 90 ? 'great' : 'good');
  else if (!out.some((d) => !POSITIVE.has(d.id))) add('almost');

  return out.sort((a, b) => PRIORITY.indexOf(a.id) - PRIORITY.indexOf(b.id));
}
