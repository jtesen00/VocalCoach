import type { ProfileRanges } from '../profile/vocal-profile';
import { allNotes, secondsPerBeat } from './melody';
import type { Song } from './types';

/** Salto a partir del cual una transición se considera grande (cuarta justa). */
export const LEAP_SEMITONES = 5;
/** Nota larga: al menos esta duración (s). */
export const LONG_NOTE_S = 1.2;

/** ¿Es una nota larga? (con tolerancia: 4,8 − 3,6 = 1,1999… en coma flotante). */
export const isLong = (seconds: number) => seconds >= LONG_NOTE_S - 1e-6;

export interface SongAnalysis {
  lowest: number;
  highest: number;
  span: number;
  /** Notas en los 3 semitonos superiores / inferiores de la canción. */
  highNotes: number;
  lowNotes: number;
  leaps: number;
  maxLeap: number;
  longNotes: number;
  /** Nota más corta (s) y notas por segundo máximas en una frase: ritmo. */
  shortestNoteS: number;
  maxNotesPerSecond: number;
  sections: { name: string; lowest: number; highest: number }[];
}

export function analyzeSong(song: Song, transpose = 0): SongAnalysis {
  const notes = allNotes(song).map((n) => ({ ...n, midi: n.midi + transpose }));
  const midis = notes.map((n) => n.midi);
  const lowest = Math.min(...midis);
  const highest = Math.max(...midis);
  const spb = secondsPerBeat(song);

  let leaps = 0;
  let maxLeap = 0;
  let maxNps = 0;
  for (const s of song.sections) {
    for (const p of s.phrases) {
      for (let i = 1; i < p.notes.length; i++) {
        const d = Math.abs(p.notes[i].midi - p.notes[i - 1].midi);
        maxLeap = Math.max(maxLeap, d);
        if (d >= LEAP_SEMITONES) leaps++;
      }
      const dur = p.notes.reduce((a, n) => a + (n.beats + (n.restBefore ?? 0)) * spb, 0);
      maxNps = Math.max(maxNps, p.notes.length / dur);
    }
  }

  return {
    lowest,
    highest,
    span: highest - lowest,
    highNotes: midis.filter((m) => m >= highest - 2).length,
    lowNotes: midis.filter((m) => m <= lowest + 2).length,
    leaps,
    maxLeap,
    longNotes: notes.filter((n) => isLong(n.beats * spb)).length,
    shortestNoteS: Math.min(...notes.map((n) => n.beats * spb)),
    maxNotesPerSecond: maxNps,
    sections: song.sections.map((s) => {
      const m = s.phrases.flatMap((p) => p.notes.map((n) => n.midi + transpose));
      return { name: s.name, lowest: Math.min(...m), highest: Math.max(...m) };
    }),
  };
}

export interface RangeWarning {
  section: string;
  side: 'above' | 'below';
  /** Semitonos fuera de la zona cómoda. */
  semitones: number;
}

/** Secciones con notas fuera de la zona cómoda (spec §5). */
export function rangeWarnings(a: SongAnalysis, r: ProfileRanges): RangeWarning[] {
  const c = r.comfortable;
  if (!c) return [];
  const out: RangeWarning[] = [];
  for (const s of a.sections) {
    if (s.highest > c.highMidi) out.push({ section: s.name, side: 'above', semitones: s.highest - c.highMidi });
    if (s.lowest < c.lowMidi) out.push({ section: s.name, side: 'below', semitones: c.lowMidi - s.lowest });
  }
  return out;
}
