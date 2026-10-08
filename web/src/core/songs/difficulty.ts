import type { ProfileRanges, VocalProfile } from '../profile/vocal-profile';
import { difficultIntervals, profileRanges } from '../profile/vocal-profile';
import { analyzeSong } from './analysis';
import { expectedAccuracy } from './key';
import type { Song } from './types';

export type Stars = 1 | 2 | 3 | 4 | 5;

export interface SongDifficulty {
  pitch: Stars;
  range: Stars;
  highNotes: Stars;
  transitions: Stars;
  timing: Stars;
  overall: 'Fácil' | 'Media' | 'Difícil' | 'Muy difícil';
}

const clamp = (n: number): Stars => Math.max(1, Math.min(5, Math.round(n))) as Stars;
const steps = (v: number, thresholds: number[]): Stars => clamp(1 + thresholds.filter((t) => v > t).length);

/**
 * Dificultad de una canción PARA ESTE USUARIO y en esta tonalidad (spec §13):
 * la misma canción puntúa distinto según la voz y el historial de cada persona.
 */
export function songDifficulty(song: Song, transpose: number, p: VocalProfile, r: ProfileRanges = profileRanges(p)): SongDifficulty {
  const a = analyzeSong(song, transpose);
  const c = r.comfortable;

  const acc = expectedAccuracy(song, transpose, p, r);
  const pitch = steps(1 - acc, [0.15, 0.25, 0.35, 0.5]);

  const range = c ? steps(a.span / Math.max(1, c.highMidi - c.lowMidi), [0.5, 0.7, 0.9, 1.1]) : steps(a.span, [7, 10, 13, 16]);

  const highNotes = c ? steps(a.highest - c.highMidi, [-4, -2, 0, 2]) : steps(a.highest, [67, 70, 73, 76]);

  // Saltos: el más grande, y si el usuario ya tiene problemas con saltos así, una estrella más.
  const hard = difficultIntervals(p).some((d) => Math.abs(d.semitones) <= a.maxLeap && Math.abs(d.semitones) >= 3);
  const transitions = clamp(steps(a.maxLeap, [4, 5, 7, 9]) + (hard ? 1 : 0));

  const timing = clamp(Math.max(steps(0.6 - a.shortestNoteS, [0, 0.15, 0.3, 0.4]), steps(a.maxNotesPerSecond, [2, 3, 4, 5])));

  const mean = (2 * pitch + range + 2 * highNotes + transitions + timing) / 7;
  const overall = mean <= 1.8 ? 'Fácil' : mean <= 2.6 ? 'Media' : mean <= 3.4 ? 'Difícil' : 'Muy difícil';
  return { pitch, range, highNotes, transitions, timing, overall };
}
