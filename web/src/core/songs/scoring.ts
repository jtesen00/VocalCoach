import type { ExerciseEvaluation, NoteEvaluation } from '../exercises/evaluate';
import type { ExercisePlan } from '../exercises/types';
import type { ProfileRanges } from '../profile/vocal-profile';
import type { OctaveMode } from '../scoring/pitch-scoring';
import { diagnose } from '../teacher/diagnose';
import { isLong, LEAP_SEMITONES } from './analysis';

export type PhraseIssueKind = 'none' | 'no_voice' | 'melody' | 'leap' | 'high_notes' | 'low_notes' | 'sustained' | 'flat' | 'sharp';

export interface PhraseIssue {
  kind: PhraseIssueKind;
  /** Nota (índice en la frase) donde se concentra el problema. */
  noteIndex: number | null;
  /** En saltos: la nota de partida. */
  fromIndex: number | null;
}

export interface PhraseResult {
  /** 0..100 */
  score: number;
  accuracy: number | null;
  status: 'good' | 'fair' | 'weak';
  issue: PhraseIssue;
}

/** Una nota "fallada": sin voz o por debajo de este acierto. */
const MISS_BELOW = 0.6;

const missed = (n: NoteEvaluation) => n.accuracy === null || n.accuracy < MISS_BELOW;

/**
 * Puntuación de una frase cantada. A diferencia de los ejercicios, en una canción hay
 * consonantes y notas muy cortas: no se exige voz en todas las notas, se mide el acierto
 * global (ponderado por tiempo) y que se haya cantado la mayor parte de la frase.
 */
export function scorePhrase(plan: ExercisePlan, e: ExerciseEvaluation, octaveMode: OctaveMode, r: ProfileRanges | null): PhraseResult {
  const inTune = e.notes.reduce((a, n) => a + n.inTuneFrames, 0);
  const evaluated = e.notes.reduce((a, n) => a + n.evaluatedFrames, 0);
  const accuracy = evaluated ? inTune / evaluated : null;
  const sungRatio = e.notes.filter((n) => n.accuracy !== null).length / e.notes.length;
  const score = accuracy === null ? 0 : Math.round(100 * accuracy * Math.min(1, sungRatio / 0.8));
  return {
    score,
    accuracy,
    status: score >= 80 ? 'good' : score >= 60 ? 'fair' : 'weak',
    issue: phraseIssue(plan, e, octaveMode, r),
  };
}

/** Problema principal de la frase, para explicarlo y generar entrenamiento (spec §9–10). */
export function phraseIssue(plan: ExercisePlan, e: ExerciseEvaluation, octaveMode: OctaveMode, r: ProfileRanges | null): PhraseIssue {
  const none = (kind: PhraseIssueKind, noteIndex: number | null = null, fromIndex: number | null = null): PhraseIssue => ({ kind, noteIndex, fromIndex });
  const notes = e.notes;
  if (notes.every((n) => n.accuracy === null)) return none('no_voice');

  const diag = diagnose(e, octaveMode).map((d) => d.id);
  if (diag.includes('not_following')) return none('melody');

  const misses = notes.filter(missed);
  if (!misses.length) {
    if (diag.includes('flat')) return none('flat', worst(notes));
    if (diag.includes('sharp')) return none('sharp', worst(notes));
    return none('none');
  }

  // Salto grande hacia una nota fallada, viniendo de una nota acertada.
  const leaps = notes
    .map((n, i) => ({ n, i, d: i ? n.targetMidi - notes[i - 1].targetMidi : 0 }))
    .filter(({ n, i, d }) => i > 0 && Math.abs(d) >= LEAP_SEMITONES && missed(n) && !missed(notes[i - 1]))
    .sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
  if (leaps.length) return none('leap', leaps[0].i, leaps[0].i - 1);

  const targets = notes.map((n) => n.targetMidi);
  const hi = Math.max(...targets);
  const lo = Math.min(...targets);
  const highCut = Math.min(hi - 2, r?.comfortable ? r.comfortable.highMidi : Infinity);
  const lowCut = Math.max(lo + 2, r?.comfortable ? r.comfortable.lowMidi : -Infinity);
  const rate = (sel: NoteEvaluation[]) => (sel.length ? sel.filter(missed).length / sel.length : 0);
  const high = notes.filter((n) => n.targetMidi >= highCut && hi - lo >= 3);
  const low = notes.filter((n) => n.targetMidi <= lowCut && hi - lo >= 3);
  if (high.length && rate(high) >= 0.5 && rate(high) > rate(notes.filter((n) => !high.includes(n)))) {
    return none('high_notes', high.filter(missed).sort((a, b) => b.targetMidi - a.targetMidi)[0].index);
  }
  if (low.length && rate(low) >= 0.5 && rate(low) > rate(notes.filter((n) => !low.includes(n)))) {
    return none('low_notes', low.filter(missed).sort((a, b) => a.targetMidi - b.targetMidi)[0].index);
  }

  const long = notes.filter((n, i) => isLong(plan.segments[i].endS - plan.segments[i].startS) && missed(n));
  if (long.length) return none('sustained', long[0].index);

  if (diag.includes('flat')) return none('flat', worst(notes));
  if (diag.includes('sharp')) return none('sharp', worst(notes));
  return none('melody', misses[0].index);
}

function worst(notes: NoteEvaluation[]): number | null {
  const sung = notes.filter((n) => n.medianCents !== null);
  if (!sung.length) return null;
  return sung.reduce((a, b) => (Math.abs(b.medianCents!) > Math.abs(a.medianCents!) ? b : a)).index;
}

/** La frase más débil entre las ya cantadas (por debajo de 80). */
export function weakestPhrase<T extends { score: number }>(results: Record<string, T | undefined>): string | null {
  let worstId: string | null = null;
  let worstScore = 80;
  for (const [id, r] of Object.entries(results)) {
    if (r && r.score < worstScore) {
      worstScore = r.score;
      worstId = id;
    }
  }
  return worstId;
}

