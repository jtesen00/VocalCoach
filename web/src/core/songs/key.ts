import { noteSuccess, intervalSuccess, profileRanges, type ProfileRanges, type VocalProfile } from '../profile/vocal-profile';
import { isLong, LEAP_SEMITONES } from './analysis';
import { secondsPerBeat } from './melody';
import type { Song } from './types';

export interface KeyCandidate {
  transpose: number;
  lowest: number;
  highest: number;
  /** Semitonos por encima / por debajo de la zona cómoda (0 si cabe). */
  aboveComfort: number;
  belowComfort: number;
  aboveReliable: number;
  belowReliable: number;
  /** Acierto esperado según el perfil (0..1). */
  expectedAccuracy: number;
  /** Lo que el usuario ha hecho de verdad en esta tonalidad, si lo ha cantado. */
  observed: { attempts: number; accuracy: number } | null;
  /** Puntuación final (mayor es mejor). */
  score: number;
}

export type KeyReason = 'original-fits' | 'lower' | 'higher' | 'no-profile';

export interface KeyRecommendation {
  best: KeyCandidate;
  original: KeyCandidate;
  candidates: KeyCandidate[];
  reason: KeyReason;
}

/** Resultados reales por tonalidad: transposición → precisiones de frases cantadas. */
export type KeyHistory = Record<string, number[]>;

/** Hasta una octava arriba o abajo (una voz grave puede necesitar bajar mucho una canción aguda). */
export const KEY_CANDIDATES = Array.from({ length: 25 }, (_, i) => i - 12);
/** Pequeña preferencia por la versión original a igualdad de resultados. */
const DISTANCE_PENALTY = 0.004;
/** Peso de las notas largas (cuestan más de sostener). */
const LONG_NOTE_WEIGHT = 1.5;

/**
 * Acierto esperado de una canción en una tonalidad: media de las notas (ponderada por
 * duración y con las notas largas pesando más), donde cada nota vale lo que el perfil
 * dice que el usuario acierta ahí, y los saltos grandes multiplican por su tasa de acierto.
 */
export function expectedAccuracy(song: Song, transpose: number, p: VocalProfile, r: ProfileRanges = profileRanges(p)): number {
  const spb = secondsPerBeat(song);
  let sum = 0;
  let weight = 0;
  for (const s of song.sections) {
    for (const ph of s.phrases) {
      ph.notes.forEach((n, i) => {
        const midi = n.midi + transpose;
        let pr = noteSuccess(p, midi, r);
        const prev = ph.notes[i - 1];
        if (prev && Math.abs(n.midi - prev.midi) >= LEAP_SEMITONES) pr *= intervalSuccess(p, n.midi - prev.midi);
        const dur = n.beats * spb;
        const w = dur * (isLong(dur) ? LONG_NOTE_WEIGHT : 1);
        sum += pr * w;
        weight += w;
      });
    }
  }
  return weight ? sum / weight : 0;
}

/**
 * Motor de recomendación de tono (spec §6 y §8). No busca solo "que quepa": elige la
 * tonalidad con mayor acierto esperado, y a medida que el usuario canta en una tonalidad,
 * lo que realmente consigue pesa cada vez más que la estimación.
 */
export function recommendKey(song: Song, p: VocalProfile, history: KeyHistory = {}, candidates = KEY_CANDIDATES): KeyRecommendation {
  const r = profileRanges(p);
  const notes = song.sections.flatMap((s) => s.phrases.flatMap((ph) => ph.notes.map((n) => n.midi)));
  const lo = Math.min(...notes);
  const hi = Math.max(...notes);

  const evaluated = candidates.map((t): KeyCandidate => {
    const lowest = lo + t;
    const highest = hi + t;
    const out = (range: ProfileRanges['comfortable']) => ({
      above: range ? Math.max(0, highest - range.highMidi) : 0,
      below: range ? Math.max(0, range.lowMidi - lowest) : 0,
    });
    const comfort = out(r.comfortable);
    const reliable = out(r.reliable);
    const expected = expectedAccuracy(song, t, p, r);
    const obs = history[String(t)];
    const observed = obs?.length ? { attempts: obs.length, accuracy: obs.reduce((a, b) => a + b, 0) / obs.length } : null;
    // Con más intentos reales en esta tonalidad, más pesa lo observado frente a lo estimado.
    const w = observed ? observed.attempts / (observed.attempts + 3) : 0;
    const blended = observed ? (1 - w) * expected + w * observed.accuracy : expected;
    return {
      transpose: t,
      lowest,
      highest,
      aboveComfort: comfort.above,
      belowComfort: comfort.below,
      aboveReliable: reliable.above,
      belowReliable: reliable.below,
      expectedAccuracy: expected,
      observed,
      score: blended - DISTANCE_PENALTY * Math.abs(t),
    };
  });

  const original = evaluated.find((c) => c.transpose === 0)!;
  if (!r.comfortable && !r.detected && !Object.keys(history).length) {
    return { best: original, original, candidates: evaluated, reason: 'no-profile' };
  }
  const best = evaluated.reduce((a, b) => (b.score > a.score ? b : a));
  // Si la original está prácticamente igual de bien, se prefiere la original.
  const chosen = original.score >= best.score - 0.01 ? original : best;
  return {
    best: chosen,
    original,
    candidates: evaluated,
    reason: chosen.transpose === 0 ? 'original-fits' : chosen.transpose < 0 ? 'lower' : 'higher',
  };
}

const KEY_NAMES = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];
const KEY_LETTERS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** "La menor" o, con detalles técnicos, "A menor". */
export function keyName(song: Song, transpose: number, letters = false): string {
  const pc = (((song.key.tonic + transpose) % 12) + 12) % 12;
  return `${(letters ? KEY_LETTERS : KEY_NAMES)[pc]} ${song.key.mode}`;
}
